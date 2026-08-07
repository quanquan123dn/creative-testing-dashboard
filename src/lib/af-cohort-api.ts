/**
 * AppsFlyer Cohort API client for Layer 2 buyer_rate_d3 data
 * Primary data source — accurate but delayed ~3 days
 * Uses POST /api/cohorts/v1/data/app/{app_id} with af_purchase KPI
 */

const AF_TOKEN = (process.env.APPSFLYER_TOKEN || '').trim();
const AF_APP_ID = (process.env.AF_APP_ID || 'com.fansipan.epic.stickman.survival.rpg.idle.game').trim();

export interface AFCohortRow {
  adset_name: string;
  users: number;
  cost: number;
  ecpi: number;
  buyer_rate_d3: number;      // af_purchase_conversion_rate_day_3
  unique_buyers_d3: number;   // af_purchase_unique_users_day_3
  purchase_count_d3: number;  // af_purchase_count_day_3
  purchase_revenue_d3: number;// af_purchase_sum_day_3
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Fetch af_purchase cohort data from AppsFlyer API
 * @param fromDate - Start date (yyyy-mm-dd)
 * @param toDate - End date (yyyy-mm-dd)
 * @param appId - AppsFlyer app ID
 */
export async function getAFCohortBuyerData(
  fromDate: string,
  toDate: string,
  appId?: string,
): Promise<AFCohortRow[]> {
  const effectiveAppId = appId || AF_APP_ID;
  if (!AF_TOKEN) {
    console.warn('[AF Cohort] No APPSFLYER_TOKEN configured');
    return [];
  }

  const url = `https://hq1.appsflyer.com/api/cohorts/v1/data/app/${effectiveAppId}`;
  console.log(`[AF Cohort] Fetching ${effectiveAppId} from=${fromDate} to=${toDate} token_len=${AF_TOKEN.length}`);
  const body = {
    cohort_type: 'user_acquisition',
    from: fromDate,
    to: toDate,
    groupings: ['af_adset'],
    kpis: ['af_purchase'],
    aggregation_type: 'cumulative',
    partial_data: true,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${AF_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AppsFlyer Cohort API error: ${res.status} - ${text}`);
  }

  const csv = await res.text();
  const lines = csv.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);

  // Find column indices for day_3 metrics
  const idxAdset = headers.indexOf('af_adset');
  const idxUsers = headers.indexOf('users');
  const idxCost = headers.indexOf('cost');
  const idxEcpi = headers.indexOf('ecpi');
  const idxConvRate = headers.indexOf('af_purchase_conversion_rate_day_3');
  const idxUniqueUsers = headers.indexOf('af_purchase_unique_users_day_3');
  const idxCount = headers.indexOf('af_purchase_count_day_3');
  const idxSum = headers.indexOf('af_purchase_sum_day_3');

  const rows: AFCohortRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < 4) continue;

    const users = parseFloat(values[idxUsers] || '0');
    if (users <= 0) continue; // Skip empty rows

    rows.push({
      adset_name: values[idxAdset] || values[0] || '',
      users,
      cost: parseFloat(values[idxCost] || '0'),
      ecpi: parseFloat(values[idxEcpi] || '0'),
      buyer_rate_d3: parseFloat(values[idxConvRate] || '0'),
      unique_buyers_d3: parseInt(values[idxUniqueUsers] || '0', 10),
      purchase_count_d3: parseInt(values[idxCount] || '0', 10),
      purchase_revenue_d3: parseFloat(values[idxSum] || '0'),
    });
  }

  return rows;
}

/**
 * Split a date range into 60-day chunks and fetch AF data for each.
 * Aggregates results by adset name across all chunks.
 * This works around AF API's 60-day max range limit.
 */
export async function getAFCohortBuyerDataChunked(
  campaignStartDate: string,
  appId?: string,
): Promise<AFCohortRow[]> {
  const MAX_DAYS = 57; // Leave small buffer under 60
  const start = new Date(campaignStartDate);
  const end = new Date();
  end.setDate(end.getDate() - 3); // AF data delayed ~3 days

  // Generate date chunks
  const chunks: { from: string; to: string }[] = [];
  let chunkStart = new Date(start);
  while (chunkStart < end) {
    const chunkEnd = new Date(chunkStart);
    chunkEnd.setDate(chunkEnd.getDate() + MAX_DAYS);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());

    chunks.push({
      from: chunkStart.toISOString().split('T')[0],
      to: chunkEnd.toISOString().split('T')[0],
    });

    chunkStart = new Date(chunkEnd);
    chunkStart.setDate(chunkStart.getDate() + 1);
  }

  console.log(`[AF Cohort] Fetching ${chunks.length} chunks: ${chunks.map(c => `${c.from}~${c.to}`).join(', ')}`);

  // Fetch all chunks in parallel
  const allResults = await Promise.all(
    chunks.map(chunk =>
      getAFCohortBuyerData(chunk.from, chunk.to, appId).catch(err => {
        console.error(`[AF Cohort] Chunk ${chunk.from}~${chunk.to} error:`, err.message);
        return [] as AFCohortRow[];
      })
    )
  );

  // Aggregate by adset name across all chunks
  const aggregated: Record<string, AFCohortRow> = {};
  for (const rows of allResults) {
    for (const row of rows) {
      const key = row.adset_name;
      if (!aggregated[key]) {
        aggregated[key] = { ...row };
      } else {
        aggregated[key].users += row.users;
        aggregated[key].cost += row.cost;
        aggregated[key].unique_buyers_d3 += row.unique_buyers_d3;
        aggregated[key].purchase_count_d3 += row.purchase_count_d3;
        aggregated[key].purchase_revenue_d3 += row.purchase_revenue_d3;
      }
    }
  }

  // Recalculate rates
  const result = Object.values(aggregated).map(row => ({
    ...row,
    ecpi: row.users > 0 ? row.cost / row.users : 0,
    buyer_rate_d3: row.users > 0 ? (row.unique_buyers_d3 / row.users) * 100 : 0,
  }));

  console.log(`[AF Cohort] Total: ${result.length} adsets, ${result.reduce((s, r) => s + r.users, 0)} users`);
  return result;
}

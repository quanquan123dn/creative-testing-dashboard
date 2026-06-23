/**
 * Unity Ads Advertising Statistics API v2 module
 * Fetches creative pack level data for PLA campaigns
 */

export interface UnityCreativeStat {
  creative_pack_id: string;
  creative_pack_name: string;
  starts: number;  // impressions (ad started)
  views: number;   // completed views
  clicks: number;
  installs: number;
  spend: number;
  ipm: number;
  ctr: number;
  cvr: number;     // conversion rate (installs/clicks)
  cpi: number;
  cpm: number;     // cost per mille impressions
  test_date: string; // first date with data
}

export interface UnityInsightsResult {
  campaign: {
    id: string;
    name: string;
  };
  creatives: UnityCreativeStat[];
  lastSync: string;
}

function getBasicAuthHeader(): string {
  const keyId = (process.env.UNITY_KEY_ID || '').trim();
  const secretKey = (process.env.UNITY_SECRET_KEY || '').trim();
  if (!keyId || !secretKey) {
    throw new Error('Missing UNITY_KEY_ID or UNITY_SECRET_KEY environment variables');
  }
  const encoded = Buffer.from(`${keyId}:${secretKey}`).toString('base64');
  return `Basic ${encoded}`;
}

function getDateRange(datePreset: string): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString().split('T')[0];

  let daysBack = 30;
  switch (datePreset) {
    case 'today':
      daysBack = 0;
      break;
    case 'yesterday':
      daysBack = 1;
      break;
    case 'last_7d':
      daysBack = 7;
      break;
    case 'last_14d':
      daysBack = 14;
      break;
    case 'last_30d':
      daysBack = 30;
      break;
    case 'last_90d':
      daysBack = 90;
      break;
    case 'maximum':
      daysBack = 365;
      break;
    default:
      daysBack = 30;
  }

  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - daysBack);
  const start = startDate.toISOString().split('T')[0];

  return { start, end };
}

function parseCSV(csv: string): Record<string, string>[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];

  // Remove BOM if present
  const headerLine = lines[0].replace(/^\uFEFF/, '');
  const headers = parseCSVLine(headerLine);
  
  const results: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = (values[idx] || '').replace(/^"|"$/g, '').trim();
    });
    results.push(row);
  }
  return results;
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
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

export async function getUnityCreativeStats(datePreset: string): Promise<UnityInsightsResult> {
  const orgId = (process.env.UNITY_ORG_ID || '').trim();
  const campaignId = (process.env.UNITY_CAMPAIGN_ID || '').trim();
  const campaignName = (process.env.UNITY_CAMPAIGN_NAME || 'Unity PLA Campaign').trim();

  if (!orgId || !campaignId) {
    throw new Error('Missing UNITY_ORG_ID or UNITY_CAMPAIGN_ID environment variables');
  }

  const authHeader = getBasicAuthHeader();
  const { start, end } = getDateRange(datePreset);

  const url = `https://services.api.unity.com/advertise/stats/v2/organizations/${orgId}/reports/acquisitions?start=${start}&end=${end}&metrics=starts,views,clicks,installs,spend&scale=day&campaignIds=${campaignId}&breakdowns=creativePack`;

  const response = await fetch(url, {
    headers: {
      'Authorization': authHeader,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Unity API error (${response.status}): ${errorText}`);
  }

  const csvText = await response.text();
  const rows = parseCSV(csvText);

  // Aggregate daily rows by creative pack
  const byId = new Map<string, any>();
  for (const row of rows) {
    const id = row['creative pack id'] || '';
    if (!id) continue;
    if (!byId.has(id)) {
      byId.set(id, {
        creative_pack_id: id,
        creative_pack_name: row['creative pack name'] || '',
        starts: 0, views: 0, clicks: 0, installs: 0, spend: 0,
        test_date: row['date'] || row['timestamp'] || '',
      });
    }
    const agg = byId.get(id)!;
    agg.starts += parseFloat(row['starts'] || '0');
    agg.views += parseFloat(row['views'] || '0');
    agg.clicks += parseFloat(row['clicks'] || '0');
    agg.installs += parseFloat(row['installs'] || '0');
    agg.spend += parseFloat(row['spend'] || '0');
    // Track earliest date
    const rowDate = row['date'] || row['timestamp'] || '';
    if (rowDate && (!agg.test_date || rowDate < agg.test_date)) {
      agg.test_date = rowDate;
    }
  }

  const creatives: UnityCreativeStat[] = Array.from(byId.values()).map((agg) => {
    const starts = agg.starts;
    const clicks = agg.clicks;
    const installs = agg.installs;
    const spend = agg.spend;

    return {
      creative_pack_id: agg.creative_pack_id,
      creative_pack_name: agg.creative_pack_name,
      starts,
      views: agg.views,
      clicks,
      installs,
      spend,
      ipm: starts > 0 ? (installs / starts) * 1000 : 0,
      ctr: starts > 0 ? (clicks / starts) * 100 : 0,
      cvr: clicks > 0 ? (installs / clicks) * 100 : 0,
      cpi: installs > 0 ? spend / installs : 0,
      cpm: starts > 0 ? (spend / starts) * 1000 : 0,
      test_date: agg.test_date || '',
    };
  });

  return {
    campaign: {
      id: campaignId,
      name: campaignName,
    },
    creatives,
    lastSync: new Date().toISOString(),
  };
}

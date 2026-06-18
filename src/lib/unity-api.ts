/**
 * Unity Ads Advertising Statistics API v2 module
 * Fetches creative pack level data for PLA campaigns
 */

export interface UnityCreativeStat {
  creative_pack_id: string;
  creative_pack_name: string;
  views: number;
  clicks: number;
  installs: number;
  spend: number;
  ipm: number;
  ctr: number;
  click_to_install: number;
  cpi: number;
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
  const keyId = process.env.UNITY_KEY_ID;
  const secretKey = process.env.UNITY_SECRET_KEY;
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
  const orgId = process.env.UNITY_ORG_ID;
  const campaignId = process.env.UNITY_CAMPAIGN_ID;
  const campaignName = process.env.UNITY_CAMPAIGN_NAME || 'Unity PLA Campaign';

  if (!orgId || !campaignId) {
    throw new Error('Missing UNITY_ORG_ID or UNITY_CAMPAIGN_ID environment variables');
  }

  const authHeader = getBasicAuthHeader();
  const { start, end } = getDateRange(datePreset);

  const url = `https://services.api.unity.com/advertise/stats/v2/organizations/${orgId}/reports/acquisitions?start=${start}&end=${end}&metrics=views,clicks,installs,spend&scale=summary&campaignIds=${campaignId}&breakdowns=creativePack`;

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

  const creatives: UnityCreativeStat[] = rows.map((row) => {
    const views = parseFloat(row['views'] || '0');
    const clicks = parseFloat(row['clicks'] || '0');
    const installs = parseFloat(row['installs'] || '0');
    const spend = parseFloat(row['spend'] || '0');

    return {
      creative_pack_id: row['creative pack id'] || '',
      creative_pack_name: row['creative pack name'] || '',
      views,
      clicks,
      installs,
      spend,
      ipm: views > 0 ? (installs / views) * 1000 : 0,
      ctr: views > 0 ? (clicks / views) * 100 : 0,
      click_to_install: clicks > 0 ? (installs / clicks) * 100 : 0,
      cpi: installs > 0 ? spend / installs : 0,
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

/**
 * AppsFlyer data reader — reads from published Google Sheet (CSV)
 * instead of calling AppsFlyer API directly.
 */

const GOOGLE_SHEET_CSV_URL = process.env.GOOGLE_SHEET_CSV_URL || '';

export interface AppsFlyerAd {
  ad_name: string;
  campaign: string;
  media_source: string;
  impressions: number;
  clicks: number;
  installs: number;
  cost: number;
  revenue: number;
  roi: number;
  roas_d3: number;
  buyer_rate_d3: number;
  purchasers: number;
  purchasers_d3: number;
  purchase_revenue: number;
  ctr: number;
  cpi: number;
  cpm: number;
  buyer_rate: number;
}

function parseCSV(csv: string): Record<string, string>[] {
  const lines = csv.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  
  const parseRow = (line: string): string[] => {
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
  };
  
  const headers = parseRow(lines[0]);
  const rows: Record<string, string>[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseRow(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    rows.push(row);
  }
  
  return rows;
}

export async function getAppsFlyerCreativeStats(): Promise<{ campaign: string; ads: AppsFlyerAd[] }> {
  if (!GOOGLE_SHEET_CSV_URL) {
    console.warn('GOOGLE_SHEET_CSV_URL not configured, returning empty data');
    return { campaign: 'Layer 2 creative test', ads: [] };
  }

  const res = await fetch(GOOGLE_SHEET_CSV_URL, {
    next: { revalidate: 0 },
  });
  
  if (!res.ok) {
    throw new Error(`Google Sheet fetch error: ${res.status}`);
  }
  
  const csv = await res.text();
  const rows = parseCSV(csv);
  
  if (rows.length === 0) {
    return { campaign: 'Layer 2 creative test', ads: [] };
  }
  
  const campaignName = rows[0]['campaign'] || 'Layer 2 creative test';
  
  const ads: AppsFlyerAd[] = rows.map(row => {
    const installs = parseFloat(row['installs'] || '0');
    const cost = parseFloat(row['cost']?.replace(/[$,]/g, '') || '0');
    const revenue = parseFloat(row['revenue']?.replace(/[$,]/g, '') || '0');
    const roi = parseFloat(row['roi']?.replace(/[%"]/g, '') || '0');
    const purchasers = parseFloat(row['purchasers'] || '0');
    const purchasersD3 = parseFloat(row['purchasers_d3'] || '0');
    const roasD3 = parseFloat(row['roas_d3']?.replace(/[%"]/g, '') || '0');
    const buyerRateD3 = parseFloat(row['buyer_rate_d3']?.replace(/[%"]/g, '') || '0');
    
    const ctr = 0; // Not tracked in AppsFlyer sheet
    const cpi = installs > 0 ? cost / installs : 0;
    const cpm = 0; // Not tracked
    const buyerRate = installs > 0 ? (purchasers / installs) * 100 : 0;
    
    return {
      ad_name: row['ad_name'] || 'Unknown',
      campaign: row['campaign'] || '',
      media_source: row['media_source'] || '',
      impressions: 0, // Not tracked in AF sheet
      clicks: 0,
      installs,
      cost,
      revenue,
      roi,
      roas_d3: roasD3,
      buyer_rate_d3: buyerRateD3,
      purchasers,
      purchasers_d3: purchasersD3,
      purchase_revenue: revenue,
      ctr,
      cpi,
      cpm,
      buyer_rate: buyerRate,
    };
  }).filter(ad => ad.installs > 0 || ad.cost > 0);
  
  return { campaign: campaignName, ads };
}

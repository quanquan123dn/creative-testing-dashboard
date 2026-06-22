const APPSFLYER_TOKEN = process.env.APPSFLYER_TOKEN || '';
const APP_ID = 'com.fansipan.epic.stickman.survival.rpg.idle.game';
const CAMPAIGN_FILTER = 'Layer 2.5 creative test';

export interface AppsFlyerAd {
  ad_name: string;
  campaign: string;
  media_source: string;
  impressions: number;
  clicks: number;
  installs: number;
  cost: number;
  revenue: number;
  roi: number;  // Total Revenue / Total Cost (lifetime)
  roas_d3: number; // ROAS Day 3 (revenue_d3 / cost * 100)
  revenue_d3: number; // Revenue at Day 3 cohort
  purchasers: number; // af_purchase unique users
  purchase_revenue: number; // af_purchase sales in USD
  // Computed
  ctr: number;
  cpi: number;
  cpm: number;
  buyer_rate: number; // purchasers / installs * 100
}

function parseCSV(csv: string): Record<string, string>[] {
  const lines = csv.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  
  // Parse header - handle quoted fields
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

// Fetch D3 cohort data from AppsFlyer Cohort API
async function getAppsFlyerCohortD3(): Promise<Record<string, { revenue_d3: number; roas_d3: number }>> {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 100);
  
  const startStr = start.toISOString().split('T')[0];
  const endStr = end.toISOString().split('T')[0];
  
  const params = new URLSearchParams({
    from: startStr,
    to: endStr,
    groupings: 'pid,c,af_ad',
    kpis: 'cost,revenue,roi',
    cohort_type: 'user_acquisition',
    cohort_day: '3',
    min_cohort_size: '1',
    per_day: 'false',
  });
  
  const url = `https://hq1.appsflyer.com/api/cohorts/v1/data/app/${APP_ID}?${params.toString()}`;
  
  try {
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${APPSFLYER_TOKEN}`,
        'accept': 'application/json',
      },
      next: { revalidate: 0 },
    });
    
    if (!res.ok) {
      console.warn(`AppsFlyer Cohort API error: ${res.status}`);
      return {};
    }
    
    const json = await res.json();
    const result: Record<string, { revenue_d3: number; roas_d3: number }> = {};
    
    // Parse cohort response — format may vary
    const rows = json.data || json.results || json || [];
    if (Array.isArray(rows)) {
      rows.forEach((row: any) => {
        const adName = row.dimensions?.af_ad || row.af_ad || row['Ad (af_ad)'] || '';
        const campaign = row.dimensions?.c || row.c || row['Campaign (c)'] || '';
        if (!campaign.includes(CAMPAIGN_FILTER) || !adName) return;
        
        const revenue = row.kpis?.revenue?.day_3 ?? row.revenue_day_3 ?? row.revenue ?? 0;
        const cost = row.kpis?.cost?.day_3 ?? row.cost_day_3 ?? row.cost ?? 0;
        const roas = cost > 0 ? (revenue / cost) * 100 : 0;
        
        result[adName] = { revenue_d3: revenue, roas_d3: roas };
      });
    }
    
    return result;
  } catch (err) {
    console.warn('AppsFlyer Cohort D3 fetch failed:', err);
    return {};
  }
}

export async function getAppsFlyerCreativeStats(): Promise<{ campaign: string; ads: AppsFlyerAd[] }> {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 100); // 100 days to capture campaigns from March
  
  const startStr = start.toISOString().split('T')[0];
  const endStr = end.toISOString().split('T')[0];
  
  const url = `https://hq1.appsflyer.com/api/agg-data/export/app/${APP_ID}/partners_report/v5?from=${startStr}&to=${endStr}&groupings=pid,c,af_ad`;
  
  // Fetch both aggregate and cohort D3 data in parallel
  const [aggRes, cohortD3] = await Promise.all([
    fetch(url, {
      headers: {
        'Authorization': `Bearer ${APPSFLYER_TOKEN}`,
        'accept': 'text/csv',
      },
      next: { revalidate: 0 },
    }),
    getAppsFlyerCohortD3(),
  ]);
  
  if (!aggRes.ok) {
    const text = await aggRes.text();
    throw new Error(`AppsFlyer API error: ${aggRes.status} - ${text}`);
  }
  
  const csv = await aggRes.text();
  const rows = parseCSV(csv);
  
  // Filter for target campaign
  const campaignRows = rows.filter(r => {
    const campaign = r['Campaign (c)'] || r['Campaign'] || '';
    return campaign.includes(CAMPAIGN_FILTER);
  });
  
  const campaignName = campaignRows.length > 0 
    ? (campaignRows[0]['Campaign (c)'] || campaignRows[0]['Campaign'] || CAMPAIGN_FILTER)
    : CAMPAIGN_FILTER;
  
  const ads: AppsFlyerAd[] = campaignRows.map(row => {
    const impressions = parseFloat(row['Impressions'] || '0');
    const clicks = parseFloat(row['Clicks'] || '0');
    const installs = parseFloat(row['Installs'] || '0');
    const cost = parseFloat(row['Total Cost'] || '0');
    const revenue = parseFloat(row['Total Revenue'] || '0');
    const roiStr = row['ROI'] || '0';
    const roi = parseFloat(roiStr.replace('%', '')) || 0;
    const purchasers = parseFloat(row['af_purchase (Unique users)'] || '0');
    const purchaseRevenue = parseFloat(row['af_purchase (Sales in USD)'] || '0');
    
    const adName = row['Ad (af_ad)'] || row['af_ad'] || 'Unknown';
    const d3Data = cohortD3[adName];
    
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpi = installs > 0 ? cost / installs : 0;
    const cpm = impressions > 0 ? (cost / impressions) * 1000 : 0;
    const buyer_rate = installs > 0 ? (purchasers / installs) * 100 : 0;
    
    return {
      ad_name: adName,
      campaign: row['Campaign (c)'] || row['Campaign'] || '',
      media_source: row['Media Source (pid)'] || row['pid'] || '',
      impressions,
      clicks,
      installs,
      cost,
      revenue,
      roi,
      roas_d3: d3Data?.roas_d3 ?? 0,
      revenue_d3: d3Data?.revenue_d3 ?? 0,
      purchasers,
      purchase_revenue: purchaseRevenue,
      ctr,
      cpi,
      cpm,
      buyer_rate,
    };
  }).filter(ad => ad.installs > 0 || ad.impressions > 0);
  
  return { campaign: campaignName, ads };
}

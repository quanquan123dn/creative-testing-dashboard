const APPLOVIN_REPORT_KEY = process.env.APPLOVIN_REPORT_KEY || '';
const CAMPAIGN_NAME = 'Applovin_TSH009a_Jan17_Tier 0+1_T5_QuanNHLeo_BLDROASD7_Test creative_CPM billing';

export interface AppLovinCreativeSet {
  creative_set: string;
  creative_set_id: string;
  impressions: number;
  clicks: number;
  installs: number;    // from 'conversions' API column
  cost: number;
  roas_3d: number;
  sales_3d: number;    // D3 unique purchasers
  ctr: number;
  // Computed
  cpi: number;
  cpm: number;
  buyer_rate: number;  // sales_3d / installs * 100
  ir: number;          // installs / impressions * 1000 (install rate per mille)
}

export async function getAppLovinCreativeStats(): Promise<{ campaign: string; ads: AppLovinCreativeSet[] }> {
  // Calculate dates: 45-day lookback max
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 44); // 44 days back to stay within 45-day limit
  
  const startStr = start.toISOString().split('T')[0];
  const endStr = end.toISOString().split('T')[0];
  
  // API columns: use 'conversions' for installs, 'sales_3d' for D3 purchasers
  const columns = 'campaign,creative_set,creative_set_id,impressions,clicks,conversions,cost,roas_3d,sales_3d,ctr';
  
  const url = `https://r.applovin.com/report?api_key=${APPLOVIN_REPORT_KEY}&report_type=advertiser&columns=${columns}&start=${startStr}&end=${endStr}&format=json`;
  
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AppLovin API error: ${res.status} - ${text}`);
  }
  
  const json = await res.json();
  
  if (json.code !== 200) {
    throw new Error(`AppLovin API returned code ${json.code}`);
  }
  
  // Filter for our target campaign and aggregate by creative_set_id
  const campaignResults = (json.results || []).filter(
    (r: any) => r.campaign === CAMPAIGN_NAME
  );
  
  // Aggregate by creative_set_id (data may have multiple rows per creative if date breakdown)
  const byId = new Map<string, any>();
  for (const row of campaignResults) {
    const id = row.creative_set_id;
    if (!byId.has(id)) {
      byId.set(id, {
        creative_set: row.creative_set,
        creative_set_id: id,
        impressions: 0,
        clicks: 0,
        installs: 0,
        cost: 0,
        roas_3d_sum: 0,
        roas_3d_count: 0,
        sales_3d: 0,
        ctr_sum: 0,
        ctr_count: 0,
      });
    }
    const agg = byId.get(id)!;
    agg.impressions += parseFloat(row.impressions) || 0;
    agg.clicks += parseFloat(row.clicks) || 0;
    agg.installs += parseFloat(row.conversions) || 0;
    agg.cost += parseFloat(row.cost) || 0;
    agg.sales_3d += parseFloat(row.sales_3d) || 0;
    // For ROAS, we weight average by cost
    const rowCost = parseFloat(row.cost) || 0;
    const rowRoas = parseFloat(row.roas_3d) || 0;
    if (rowCost > 0) {
      agg.roas_3d_sum += rowRoas * rowCost;
      agg.roas_3d_count += rowCost;
    }
  }
  
  const ads: AppLovinCreativeSet[] = Array.from(byId.values()).map((agg) => {
    const impressions = agg.impressions;
    const installs = agg.installs;
    const cost = agg.cost;
    const roas_3d = agg.roas_3d_count > 0 ? agg.roas_3d_sum / agg.roas_3d_count : 0;
    const ctr = impressions > 0 ? (agg.clicks / impressions) * 100 : 0;
    const cpi = installs > 0 ? cost / installs : 0;
    const cpm = impressions > 0 ? (cost / impressions) * 1000 : 0;
    const buyer_rate = installs > 0 ? (agg.sales_3d / installs) * 100 : 0;
    const ir = impressions > 0 ? (installs / impressions) * 1000 : 0;
    
    return {
      creative_set: agg.creative_set,
      creative_set_id: agg.creative_set_id,
      impressions,
      clicks: agg.clicks,
      installs,
      cost,
      roas_3d,
      sales_3d: agg.sales_3d,
      ctr,
      cpi,
      cpm,
      buyer_rate,
      ir,
    };
  });
  
  return { campaign: CAMPAIGN_NAME, ads };
}

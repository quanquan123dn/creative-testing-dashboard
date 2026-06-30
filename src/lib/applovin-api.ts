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
  sales_3d: number;    // D3 unique purchasers (from buyers_3d API column)
  ctr: number;
  // Computed
  cpi: number;
  cpm: number;
  buyer_rate: number;  // sales_3d / installs * 100
  ir: number;          // installs / impressions * 1000 (install rate per mille)
  test_date: string;   // first date with data (earliest day)
}

export async function getAppLovinCreativeStats(): Promise<{ campaign: string; ads: AppLovinCreativeSet[] }> {
  // Calculate dates: 45-day lookback max
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 44); // 44 days back to stay within 45-day limit
  
  const startStr = start.toISOString().split('T')[0];
  const endStr = end.toISOString().split('T')[0];
  
  // === Call 1: Aggregated metrics (WITHOUT day) — accurate totals ===
  const metricsColumns = 'campaign,creative_set,creative_set_id,impressions,clicks,conversions,cost,roas_3d,unique_purchasers_3d,ctr';
  const metricsUrl = `https://r.applovin.com/report?api_key=${APPLOVIN_REPORT_KEY}&report_type=advertiser&columns=${metricsColumns}&start=${startStr}&end=${endStr}&format=json`;
  
  // === Call 2: Daily breakdown (WITH day) — only for test_date ===
  const dateColumns = 'day,campaign,creative_set_id';
  const dateUrl = `https://r.applovin.com/report?api_key=${APPLOVIN_REPORT_KEY}&report_type=advertiser&columns=${dateColumns}&start=${startStr}&end=${endStr}&format=json`;
  
  // Fetch both in parallel
  const [metricsRes, dateRes] = await Promise.all([
    fetch(metricsUrl, { next: { revalidate: 0 } }),
    fetch(dateUrl, { next: { revalidate: 0 } }),
  ]);

  if (!metricsRes.ok) {
    const text = await metricsRes.text();
    throw new Error(`AppLovin API error: ${metricsRes.status} - ${text}`);
  }
  
  const metricsJson = await metricsRes.json();
  if (metricsJson.code !== 200) {
    throw new Error(`AppLovin API returned code ${metricsJson.code}`);
  }

  // --- Process metrics (aggregated, no day breakdown) ---
  const campaignResults = (metricsJson.results || []).filter(
    (r: any) => r.campaign === CAMPAIGN_NAME
  );
  
  const ads: AppLovinCreativeSet[] = campaignResults.map((row: any) => {
    const impressions = parseFloat(row.impressions) || 0;
    const clicks = parseFloat(row.clicks) || 0;
    const installs = parseFloat(row.conversions) || 0;
    const cost = parseFloat(row.cost) || 0;
    const roas_3d = parseFloat(row.roas_3d) || 0;
    const sales_3d = parseFloat(row.unique_purchasers_3d) || 0;
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpi = installs > 0 ? cost / installs : 0;
    const cpm = impressions > 0 ? (cost / impressions) * 1000 : 0;
    const buyer_rate = installs > 0 ? (sales_3d / installs) * 100 : 0;
    const ir = impressions > 0 ? (installs / impressions) * 1000 : 0;

    return {
      creative_set: row.creative_set,
      creative_set_id: row.creative_set_id,
      impressions,
      clicks,
      installs,
      cost,
      roas_3d,
      sales_3d,
      ctr,
      cpi,
      cpm,
      buyer_rate,
      ir,
      test_date: '', // will be filled from date call
    };
  });

  // --- Process test dates (daily breakdown) ---
  try {
    if (dateRes.ok) {
      const dateJson = await dateRes.json();
      if (dateJson.code === 200) {
        const dateResults = (dateJson.results || []).filter(
          (r: any) => r.campaign === CAMPAIGN_NAME
        );
        
        // Find earliest date per creative_set_id
        const testDates = new Map<string, string>();
        for (const row of dateResults) {
          const id = row.creative_set_id;
          const day = row.day || '';
          if (day && (!testDates.has(id) || day < testDates.get(id)!)) {
            testDates.set(id, day);
          }
        }
        
        // Merge test_date into ads
        for (const ad of ads) {
          ad.test_date = testDates.get(ad.creative_set_id) || '';
        }
      }
    }
  } catch {
    // test_date is non-critical, ignore errors
  }
  
  return { campaign: CAMPAIGN_NAME, ads };
}

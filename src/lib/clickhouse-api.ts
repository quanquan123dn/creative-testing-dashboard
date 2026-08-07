/**
 * ClickHouse HTTP API client for Layer 2 creative test data
 * Uses the ms5_dashboard_data_mkt table for cohort metrics (ROAS D3, Buyer Rate D3, etc.)
 */

const CH_HOST = process.env.CH_HOST || '117.6.160.176';
const CH_PORT = process.env.CH_PORT || '8123';
const CH_USER = process.env.CH_USER || 'zitga_clickhouse';
const CH_PASS = process.env.CH_PASS || 'Zitga%40123';
const CH_DB = process.env.CH_DB || 'analytics';

export interface ClickHouseL2Ad {
  ad_name: string;
  adset_name: string;
  campaign: string;
  media_source: string;
  game: string;
  installs: number;
  cost: number;
  impressions: number;
  clicks: number;
  rev_iap_d3: number;
  rev_iaa_d3: number;
  rev_total_d3: number;
  iap_buyer_d3: number;
  roas_d3: number;       // (rev_iap_d3 + rev_iaa_d3) / cost * 100
  buyer_rate_d3: number; // iap_buyer_d3 / installs * 100
  ctr: number;
  cpi: number;
  cpm: number;
  ipm: number;
  first_day_ad: string;
  last_day_ad: string;
  active_days: number;
}

async function queryClickHouse(sql: string): Promise<Record<string, string>[]> {
  const url = `http://${CH_HOST}:${CH_PORT}/?database=${CH_DB}&user=${CH_USER}&password=${CH_PASS}`;

  const res = await fetch(url, {
    method: 'POST',
    body: sql + ' FORMAT JSONEachRow',
    headers: { 'Content-Type': 'text/plain' },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ClickHouse error: ${res.status} - ${text}`);
  }

  const text = await res.text();
  if (!text.trim()) return [];

  // JSONEachRow returns one JSON object per line
  return text.trim().split('\n').map(line => JSON.parse(line));
}

export async function getL2CreativeStats(campaignName: string, gameCode?: string): Promise<{
  campaign: string;
  ads: ClickHouseL2Ad[];
  queriedAt: string;
}> {
  // Query 1: Aggregate metrics from mkt table
  const sqlMkt = `
    SELECT
      ad,
      adset,
      campaign,
      media_source,
      game,
      sum(installs) as installs,
      sum(cost) as cost,
      sum(impressions) as impressions,
      sum(clicks) as clicks,
      sum(rev_iap_d3) as rev_iap_d3,
      sum(rev_iaa_d3) as rev_iaa_d3,
      sum(iap_buyer_d3) as iap_buyer_d3_raw,
      min(first_day_ad) as first_day_ad,
      max(last_day_ad) as last_day_ad,
      sum(active_days) as active_days
    FROM ms5_dashboard_data_mkt
    WHERE campaign = '${campaignName.replace(/'/g, "''")}'
    GROUP BY ad, adset, campaign, media_source, game
    HAVING cost > 0
    ORDER BY cost DESC
  `;

  // Query 2: Accurate buyer_rate_d3 from user-level overview table
  // buyer_rate_d3 = unique users with iap_revenue > 0 within D0-D3 / total unique users
  const sqlBuyerRate = `
    SELECT
      creative,
      count(DISTINCT device_id) as total_users,
      count(DISTINCT CASE WHEN iap_revenue > 0 AND age <= 3 THEN device_id END) as buyers_d3
    FROM ms5_dashboard_data_overview
    WHERE campaign = '${campaignName.replace(/'/g, "''")}'
      AND creative != ''
      AND creative IS NOT NULL
    GROUP BY creative
  `;

  const [mktRows, buyerRows] = await Promise.all([
    queryClickHouse(sqlMkt),
    queryClickHouse(sqlBuyerRate),
  ]);

  // Build buyer rate lookup by creative name
  const buyerRateMap: Record<string, { total_users: number; buyers_d3: number }> = {};
  buyerRows.forEach(row => {
    const name = row.creative || '';
    buyerRateMap[name] = {
      total_users: Number(row.total_users) || 0,
      buyers_d3: Number(row.buyers_d3) || 0,
    };
  });

  const ads: ClickHouseL2Ad[] = mktRows.map(row => {
    const installs = Number(row.installs) || 0;
    const cost = Number(row.cost) || 0;
    const impressions = Number(row.impressions) || 0;
    const clicks = Number(row.clicks) || 0;
    const rev_iap_d3 = Number(row.rev_iap_d3) || 0;
    const rev_iaa_d3 = Number(row.rev_iaa_d3) || 0;
    const rev_total_d3 = rev_iap_d3 + rev_iaa_d3;

    // Get accurate buyer count from overview table, divide by installs from mkt table
    // This matches AppsFlyer MMP: unique_purchasers_d3 / installs * 100
    const adName = row.ad || '';
    const buyerData = buyerRateMap[adName];
    const iap_buyer_d3 = buyerData?.buyers_d3 || Number(row.iap_buyer_d3_raw) || 0;
    const buyer_rate_d3 = installs > 0
      ? (iap_buyer_d3 / installs) * 100
      : 0;

    const roas_d3 = cost > 0 ? (rev_total_d3 / cost) * 100 : 0;
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpi = installs > 0 ? cost / installs : 0;
    const cpm = impressions > 0 ? (cost / impressions) * 1000 : 0;
    const ipm = impressions > 0 ? (installs / impressions) * 1000 : 0;

    return {
      ad_name: adName || 'Unknown',
      adset_name: row.adset || '',
      campaign: row.campaign || campaignName,
      media_source: row.media_source || '',
      game: row.game || gameCode || '',
      installs,
      cost,
      impressions,
      clicks,
      rev_iap_d3,
      rev_iaa_d3,
      rev_total_d3,
      iap_buyer_d3,
      roas_d3,
      buyer_rate_d3,
      ctr,
      cpi,
      cpm,
      ipm,
      first_day_ad: row.first_day_ad || '',
      last_day_ad: row.last_day_ad || '',
      active_days: Number(row.active_days) || 0,
    };
  });

  return {
    campaign: campaignName,
    ads,
    queriedAt: new Date().toISOString(),
  };
}

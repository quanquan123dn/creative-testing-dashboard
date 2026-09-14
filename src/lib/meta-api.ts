// Meta Marketing API wrapper
const BASE_URL = 'https://graph.facebook.com/v19.0';

export interface AdInsight {
  ad_id: string;
  ad_name: string;
  status: string;
  adset_status: string;
  thumbnail_url: string;
  video_id: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  installs: number;
  ctr: number;
  cpm: number;
  cpc: number;
  cpi: number;
  ipm: number;
  click_to_install: number;
  hook_rate: number;
  hold_rate: number;
  frequency: number;
  reach: number;
  video_3s_views: number;
  video_thruplay: number;
  date_start: string;
  date_stop: string;
  created_time: string;
}

export interface CampaignSummary {
  id: string;
  name: string;
  status: string;
}

async function metaFetch(path: string, params: Record<string, string> = {}) {
  const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN!;
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set('access_token', ACCESS_TOKEN);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), { cache: 'no-store' });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err?.error?.message || `Meta API error: ${res.status}`);
  }
  return res.json();
}

export async function findCampaign(campaignNameOverride?: string, adAccountId?: string): Promise<CampaignSummary | null> {
  const AD_ACCOUNT_ID = adAccountId || process.env.META_AD_ACCOUNT_ID!;
  const CAMPAIGN_NAME = campaignNameOverride || process.env.META_CAMPAIGN_NAME!;

  const data = await metaFetch(`/act_${AD_ACCOUNT_ID}/campaigns`, {
    fields: 'id,name,status',
    limit: '200',
  });

  const campaigns: CampaignSummary[] = data.data || [];
  const match = campaigns.find(
    (c) => c.name.toLowerCase().trim() === CAMPAIGN_NAME.toLowerCase().trim()
  );
  return match || null;
}

/**
 * Find multiple campaigns by name. Supports pipe-separated names in META_CAMPAIGN_NAME.
 */
export async function findCampaigns(campaignNameOverride?: string, adAccountId?: string): Promise<CampaignSummary[]> {
  const AD_ACCOUNT_ID = adAccountId || process.env.META_AD_ACCOUNT_ID!;
  const RAW_NAMES = campaignNameOverride || process.env.META_CAMPAIGN_NAME!;
  const campaignNames = RAW_NAMES.split('|').map(n => n.trim().toLowerCase());

  const data = await metaFetch(`/act_${AD_ACCOUNT_ID}/campaigns`, {
    fields: 'id,name,status',
    limit: '200',
  });

  const allCampaigns: CampaignSummary[] = data.data || [];
  return allCampaigns.filter(c => campaignNames.includes(c.name.toLowerCase().trim()));
}

export async function getCampaignAds(campaignId: string, adAccountId?: string): Promise<{
  id: string;
  name: string;
  status: string;
  created_time?: string;
  adset?: { status: string; optimization_goal?: string };
  creative: { thumbnail_url?: string; video_id?: string };
}[]> {
  // Query ads from campaign directly (not account-wide) to get all campaign ads
  const firstPage = await metaFetch(`/${campaignId}/ads`, {
    fields: 'id,name,status,created_time,adset{status,optimization_goal},creative{thumbnail_url,video_id}',
    limit: '200',
  });

  let allAds = firstPage.data || [];
  let nextUrl = firstPage.paging?.next || null;

  // Paginate through all results
  while (nextUrl) {
    const res = await fetch(nextUrl, { cache: 'no-store' });
    const page = await res.json();
    allAds = [...allAds, ...(page.data || [])];
    nextUrl = page.paging?.next || null;
  }

  return allAds;
}

function extractAction(
  actions: { action_type: string; value: string }[] | undefined,
  type: string
): number {
  const found = actions?.find((a) => a.action_type === type);
  return found ? parseFloat(found.value) : 0;
}

/**
 * Generate monthly time_range chunks for Meta API to avoid "too much data" errors.
 * Returns array of { since: 'YYYY-MM-DD', until: 'YYYY-MM-DD' } objects.
 */
function generateMonthlyChunks(monthsBack: number): { since: string; until: string }[] {
  const chunks: { since: string; until: string }[] = [];
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  for (let i = monthsBack; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = i === 0
      ? new Date(today) // current month: up to today
      : new Date(now.getFullYear(), now.getMonth() - i + 1, 0); // last day of month

    const since = start.toISOString().split('T')[0];
    const until = end.toISOString().split('T')[0];
    chunks.push({ since, until });
  }
  return chunks;
}

export async function getAllAdInsights(datePreset: string = 'last_7d', campaignNameOverride?: string, adAccountId?: string): Promise<{
  ads: AdInsight[];
  campaign: CampaignSummary | null;
  lastSync: string;
}> {
  const campaigns = await findCampaigns(campaignNameOverride, adAccountId);
  if (campaigns.length === 0) {
    return { ads: [], campaign: null, lastSync: new Date().toISOString() };
  }

  // Collect ads metadata and insights from ALL campaigns
  let allAdsMetadata: Awaited<ReturnType<typeof getCampaignAds>> = [];
  let allInsightRows: Record<string, unknown>[] = [];
  const appInstallAdIds = new Set<string>();

  for (const campaign of campaigns) {
    // Fetch ads metadata for this campaign
    const adsMetadata = await getCampaignAds(campaign.id, adAccountId);
    allAdsMetadata = [...allAdsMetadata, ...adsMetadata];

    // Fetch insights for this campaign
    const fields = [
      'ad_id', 'ad_name', 'spend', 'impressions', 'reach', 'frequency', 'clicks',
      'ctr', 'cpm', 'cpc', 'actions',
      'video_play_actions',
      'date_start', 'date_stop',
    ].join(',');

    // For 'maximum', split into monthly chunks to avoid Meta's data limit
    if (datePreset === 'maximum') {
      const chunks = generateMonthlyChunks(6); // last 6 months
      for (const chunk of chunks) {
        try {
          let nextUrl: string | null = null;
          const firstPage = await metaFetch(`/${campaign.id}/insights`, {
            fields,
            time_range: JSON.stringify(chunk),
            level: 'ad',
            limit: '200',
          });
          allInsightRows = [...allInsightRows, ...(firstPage.data || [])];
          nextUrl = firstPage.paging?.next || null;
          while (nextUrl) {
            const res = await fetch(nextUrl, { cache: 'no-store' });
            const page = await res.json();
            allInsightRows = [...allInsightRows, ...(page.data || [])];
            nextUrl = page.paging?.next || null;
          }
        } catch (e) {
          console.warn(`Chunk ${chunk.since}-${chunk.until} failed for campaign ${campaign.name}:`, e);
        }
      }
    } else {
      let nextUrl: string | null = null;
      const firstPage = await metaFetch(`/${campaign.id}/insights`, {
        fields,
        date_preset: datePreset,
        level: 'ad',
        limit: '200',
      });
      allInsightRows = [...allInsightRows, ...(firstPage.data || [])];
      nextUrl = firstPage.paging?.next || null;
      while (nextUrl) {
        const res = await fetch(nextUrl, { cache: 'no-store' });
        const page = await res.json();
        allInsightRows = [...allInsightRows, ...(page.data || [])];
        nextUrl = page.paging?.next || null;
      }
    }
  }

  // Build lookup map
  const adMap: Record<string, typeof allAdsMetadata[0]> = {};
  allAdsMetadata.forEach(ad => {
    adMap[ad.id] = ad;
    if (ad.adset?.optimization_goal === 'APP_INSTALLS') {
      appInstallAdIds.add(ad.id);
    }
  });

  // Step 1: Aggregate insight rows by ad_id
  // (Meta API may return multiple rows per ad_id due to pagination/breakdowns)
  const byAdId: Record<string, AdInsight> = {};

  allInsightRows.forEach((raw) => {
    const adId = raw.ad_id as string;
    const adMeta = adMap[adId];
    const adName = (raw.ad_name as string) || adMeta?.name || adId;

    const actions = raw.actions as { action_type: string; value: string }[] | undefined;
    const videoPlayArr = raw.video_play_actions as { action_type: string; value: string }[] | undefined;

    const spend = parseFloat(raw.spend as string || '0');
    const impressions = parseInt(raw.impressions as string || '0', 10);
    const clicks = parseInt(raw.clicks as string || '0', 10);
    const installs = extractAction(actions, 'mobile_app_install');
    const v3s = extractAction(actions, 'video_view') || (videoPlayArr ? parseFloat(videoPlayArr[0]?.value || '0') : 0);
    const vThruplay = extractAction(actions, 'video_watches_at_100_pct') || 0;
    const reach = parseInt(raw.reach as string || '0', 10);

    if (!byAdId[adId]) {
      byAdId[adId] = {
        ad_id: adId,
        ad_name: adName,
        status: adMeta?.status || 'UNKNOWN',
        adset_status: adMeta?.adset?.status || 'UNKNOWN',
        thumbnail_url: adMeta?.creative?.thumbnail_url || '',
        video_id: adMeta?.creative?.video_id || null,
        created_time: adMeta?.created_time || '',
        spend: 0, impressions: 0, clicks: 0, installs: 0,
        ctr: 0, cpm: 0, cpc: 0, cpi: 0, ipm: 0,
        click_to_install: 0, hook_rate: 0, hold_rate: 0,
        frequency: 0, reach: 0, video_3s_views: 0, video_thruplay: 0,
        date_start: raw.date_start as string || '',
        date_stop: raw.date_stop as string || '',
      };
    }

    const agg = byAdId[adId];
    agg.spend += spend;
    agg.impressions += impressions;
    agg.clicks += clicks;
    agg.installs += installs;
    agg.reach += reach;
    agg.video_3s_views += v3s;
    agg.video_thruplay += vThruplay;
  });

  // Calculate derived metrics for each ad_id
  Object.values(byAdId).forEach(agg => {
    agg.ipm = agg.impressions > 0 ? (agg.installs / agg.impressions) * 1000 : 0;
    agg.cpi = agg.installs > 0 ? agg.spend / agg.installs : 0;
    agg.cpc = agg.clicks > 0 ? agg.spend / agg.clicks : 0;
    agg.cpm = agg.impressions > 0 ? (agg.spend / agg.impressions) * 1000 : 0;
    agg.ctr = agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : 0;
    agg.click_to_install = agg.clicks > 0 ? (agg.installs / agg.clicks) * 100 : 0;
    agg.hook_rate = agg.impressions > 0 ? (agg.video_3s_views / agg.impressions) * 100 : 0;
    agg.hold_rate = agg.video_3s_views > 0 ? (agg.video_thruplay / agg.video_3s_views) * 100 : 0;
    agg.frequency = agg.reach > 0 ? agg.impressions / agg.reach : 0;
  });

  // Step 2: Aggregate by ad_name — same creative may run in multiple adsets
  // Sum spend, impressions, clicks, installs, etc. across all instances
  const aggByName: Record<string, AdInsight> = {};
  Object.values(byAdId).forEach(ad => {
    const key = ad.ad_name;
    if (!aggByName[key]) {
      aggByName[key] = { ...ad };
    } else {
      const agg = aggByName[key];
      agg.spend += ad.spend;
      agg.impressions += ad.impressions;
      agg.clicks += ad.clicks;
      agg.installs += ad.installs;
      agg.reach += ad.reach;
      agg.video_3s_views += ad.video_3s_views;
      agg.video_thruplay += ad.video_thruplay;
      // Keep the ad_id/status from the instance with most spend (most representative)
      if (ad.spend > (aggByName[key].spend - ad.spend)) {
        agg.ad_id = ad.ad_id;
        agg.status = ad.status;
        agg.adset_status = ad.adset_status;
        agg.thumbnail_url = ad.thumbnail_url || agg.thumbnail_url;
        agg.video_id = ad.video_id || agg.video_id;
      }
    }
  });

  // Recalculate derived metrics after aggregation
  Object.values(aggByName).forEach(agg => {
    agg.ipm = agg.impressions > 0 ? (agg.installs / agg.impressions) * 1000 : 0;
    agg.cpi = agg.installs > 0 ? agg.spend / agg.installs : 0;
    agg.cpc = agg.clicks > 0 ? agg.spend / agg.clicks : 0;
    agg.cpm = agg.impressions > 0 ? (agg.spend / agg.impressions) * 1000 : 0;
    agg.ctr = agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : 0;
    agg.click_to_install = agg.clicks > 0 ? (agg.installs / agg.clicks) * 100 : 0;
    agg.hook_rate = agg.impressions > 0 ? (agg.video_3s_views / agg.impressions) * 100 : 0;
    agg.hold_rate = agg.video_3s_views > 0 ? (agg.video_thruplay / agg.video_3s_views) * 100 : 0;
    agg.frequency = agg.reach > 0 ? agg.impressions / agg.reach : 0;
  });

  // Filter: only include ads from APP_INSTALLS adsets
  const appInstallAdNames = new Set<string>();
  Object.values(byAdId).forEach(ad => {
    if (appInstallAdIds.has(ad.ad_id)) {
      appInstallAdNames.add(ad.ad_name);
    }
  });
  const filteredAds = Object.values(aggByName).filter(ad => appInstallAdNames.has(ad.ad_name));

  return {
    ads: filteredAds,
    campaign: campaigns[0] || null,
    lastSync: new Date().toISOString(),
  };
}

// Meta Marketing API wrapper
const BASE_URL = 'https://graph.facebook.com/v19.0';

export interface AdInsight {
  ad_id: string;
  ad_name: string;
  status: string;
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

export async function findCampaign(): Promise<CampaignSummary | null> {
  const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID!;
  const CAMPAIGN_NAME = process.env.META_CAMPAIGN_NAME!;

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

export async function getCampaignAds(campaignId: string): Promise<{
  id: string;
  name: string;
  status: string;
  creative: { thumbnail_url?: string; video_id?: string };
}[]> {
  const data = await metaFetch(`/${campaignId}/ads`, {
    fields: 'id,name,status,creative{thumbnail_url,video_id}',
    limit: '200',
  });
  return data.data || [];
}

function extractAction(
  actions: { action_type: string; value: string }[] | undefined,
  type: string
): number {
  const found = actions?.find((a) => a.action_type === type);
  return found ? parseFloat(found.value) : 0;
}

export async function getAllAdInsights(datePreset: string = 'last_7d'): Promise<{
  ads: AdInsight[];
  campaign: CampaignSummary | null;
  lastSync: string;
}> {
  const campaign = await findCampaign();
  if (!campaign) {
    return { ads: [], campaign: null, lastSync: new Date().toISOString() };
  }

  // Fetch all ads metadata
  const adsMetadata = await getCampaignAds(campaign.id);

  // Build a lookup map for ad metadata
  const adMap: Record<string, typeof adsMetadata[0]> = {};
  adsMetadata.forEach(ad => { adMap[ad.id] = ad; });

  // Fetch campaign-level insights with ad breakdown (much more efficient than per-ad calls)
  const fields = [
    'ad_id', 'ad_name', 'spend', 'impressions', 'reach', 'frequency', 'clicks',
    'ctr', 'cpm', 'cpc', 'actions',
    'video_play_actions',
    'date_start', 'date_stop',
  ].join(',');

  // Paginate through all insight results
  let allInsightRows: Record<string, unknown>[] = [];
  let nextUrl: string | null = null;

  const firstPage = await metaFetch(`/${campaign.id}/insights`, {
    fields,
    date_preset: datePreset,
    level: 'ad',
    limit: '200',
  });

  allInsightRows = firstPage.data || [];
  nextUrl = firstPage.paging?.next || null;

  // Follow pagination if needed
  while (nextUrl) {
    const res = await fetch(nextUrl, { cache: 'no-store' });
    const page = await res.json();
    allInsightRows = [...allInsightRows, ...(page.data || [])];
    nextUrl = page.paging?.next || null;
  }

  // Map insight rows to AdInsight objects
  const adsData: AdInsight[] = allInsightRows.map((raw) => {
    const adId = raw.ad_id as string;
    const adMeta = adMap[adId];

    const actions = raw.actions as { action_type: string; value: string }[] | undefined;
    const videoPlayArr = raw.video_play_actions as { action_type: string; value: string }[] | undefined;

    const spend = parseFloat(raw.spend as string || '0');
    const impressions = parseInt(raw.impressions as string || '0', 10);
    const clicks = parseInt(raw.clicks as string || '0', 10);
    const installs = extractAction(actions, 'mobile_app_install');
    // Video 3s views from actions breakdown (video_view action)
    const v3s = extractAction(actions, 'video_view') || (videoPlayArr ? parseFloat(videoPlayArr[0]?.value || '0') : 0);
    const vThruplay = extractAction(actions, 'video_watches_at_100_pct') || 0;

    const ipm = impressions > 0 ? (installs / impressions) * 1000 : 0;
    const cpi = installs > 0 ? spend / installs : 0;
    const c2i = clicks > 0 ? (installs / clicks) * 100 : 0;
    const hookRate = impressions > 0 ? (v3s / impressions) * 100 : 0;
    const holdRate = v3s > 0 ? (vThruplay / v3s) * 100 : 0;

    return {
      ad_id: adId,
      ad_name: (raw.ad_name as string) || adMeta?.name || adId,
      status: adMeta?.status || 'UNKNOWN',
      thumbnail_url: adMeta?.creative?.thumbnail_url || '',
      video_id: adMeta?.creative?.video_id || null,
      spend,
      impressions,
      clicks,
      installs,
      ctr: parseFloat(raw.ctr as string || '0'),
      cpm: parseFloat(raw.cpm as string || '0'),
      cpc: parseFloat(raw.cpc as string || '0'),
      cpi,
      ipm,
      click_to_install: c2i,
      hook_rate: hookRate,
      hold_rate: holdRate,
      frequency: parseFloat(raw.frequency as string || '0'),
      reach: parseInt(raw.reach as string || '0', 10),
      video_3s_views: v3s,
      video_thruplay: vThruplay,
      date_start: raw.date_start as string || '',
      date_stop: raw.date_stop as string || '',
    } as AdInsight;
  });

  // Also include ads with NO spend data (so they show as "New" in table)
  const adsWithInsight = new Set(adsData.map(a => a.ad_id));
  adsMetadata.forEach(ad => {
    if (!adsWithInsight.has(ad.id)) {
      adsData.push({
        ad_id: ad.id,
        ad_name: ad.name,
        status: ad.status,
        thumbnail_url: ad.creative?.thumbnail_url || '',
        video_id: ad.creative?.video_id || null,
        spend: 0, impressions: 0, clicks: 0, installs: 0,
        ctr: 0, cpm: 0, cpc: 0, cpi: 0, ipm: 0,
        click_to_install: 0, hook_rate: 0, hold_rate: 0,
        frequency: 0, reach: 0, video_3s_views: 0, video_thruplay: 0,
        date_start: '', date_stop: '',
      });
    }
  });

  return {
    ads: adsData,
    campaign,
    lastSync: new Date().toISOString(),
  };
}

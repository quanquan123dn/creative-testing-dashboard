import { NextResponse } from 'next/server';
import { getVideoEngagementData } from '@/lib/meta-api';
import { getL1InsightsFromClickHouse } from '@/lib/clickhouse-api';
import { unstable_cache, revalidateTag } from 'next/cache';
import { getGameConfig } from '@/lib/game-config';

const VALID_PRESETS = ['today', 'yesterday', 'last_7d', 'last_14d', 'last_30d', 'last_90d', 'maximum'];

// Cache duration: 30 minutes (1800 seconds)
const CACHE_DURATION = 1800;

function getCachedInsights(datePreset: string, gameId: string) {
  const gameConfig = getGameConfig(gameId);
  return unstable_cache(
    async () => {
      const campaignNames = gameConfig.meta.layer1CampaignName.split('|').map(n => n.trim());
      
      const [chData, metaMap] = await Promise.all([
        getL1InsightsFromClickHouse(campaignNames),
        getVideoEngagementData(gameConfig.meta.layer1CampaignName, gameConfig.meta.adAccountId)
      ]);

      const mergedAds = chData.map(ad => {
        const meta = metaMap.get(ad.ad_name.toLowerCase());
        if (meta) {
          ad.hook_rate = meta.hook_rate;
          ad.hold_rate = meta.hold_rate;
          ad.thumbnail_url = meta.thumbnail_url;
          ad.video_id = meta.video_id;
          ad.video_3s_views = meta.video_3s_views;
          ad.video_thruplay = meta.video_thruplay;
        }
        return ad;
      });

      return {
        ads: mergedAds,
        campaign: { id: '', name: gameConfig.meta.layer1CampaignName, status: 'ACTIVE' },
        lastSync: new Date().toISOString(),
        cachedAt: new Date().toISOString(),
      };
    },
    [`meta-insights-${gameId}-${datePreset}`],
    {
      revalidate: CACHE_DURATION,
      tags: ['meta-insights', `meta-insights-${gameId}-${datePreset}`],
    }
  )();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawPreset = searchParams.get('date_preset') || 'last_7d';
  const datePreset = VALID_PRESETS.includes(rawPreset) ? rawPreset : 'last_7d';
  const gameId = searchParams.get('game') || 'epic-stickman';
  const force = searchParams.get('force') === 'true';

  try {
    if (force) {
      // Invalidate cache and fetch fresh data
      await revalidateTag('meta-insights', 'max');
    }

    const data = await getCachedInsights(datePreset, gameId);

    return NextResponse.json({
      success: true,
      data,
      cache: {
        cachedAt: data.cachedAt,
        revalidateSeconds: CACHE_DURATION,
        forced: force,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

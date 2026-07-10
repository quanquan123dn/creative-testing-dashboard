import { NextResponse } from 'next/server';
import { getUnityCreativeStats } from '@/lib/unity-api';
import { unstable_cache, revalidateTag } from 'next/cache';
import { getGameConfig } from '@/lib/game-config';

const VALID_PRESETS = ['today', 'yesterday', 'last_7d', 'last_14d', 'last_30d', 'last_90d', 'maximum'];

// Cache duration: 30 minutes (1800 seconds)
const CACHE_DURATION = 1800;

function getCachedUnityStats(datePreset: string, gameId: string) {
  const gameConfig = getGameConfig(gameId);
  const unityCampaignId = gameConfig.unity?.campaignId;
  const unityCampaignName = gameConfig.unity?.campaignName;
  return unstable_cache(
    async () => {
      const data = await getUnityCreativeStats(datePreset, unityCampaignId, unityCampaignName);
      return {
        ...data,
        cachedAt: new Date().toISOString(),
      };
    },
    [`unity-insights-${gameId}-${datePreset}`],
    {
      revalidate: CACHE_DURATION,
      tags: ['unity-insights', `unity-insights-${gameId}-${datePreset}`],
    }
  )();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawPreset = searchParams.get('date_preset') || 'last_30d';
  const datePreset = VALID_PRESETS.includes(rawPreset) ? rawPreset : 'last_30d';
  const gameId = searchParams.get('game') || 'epic-stickman';
  const force = searchParams.get('force') === 'true';

  try {
    if (force) {
      // Invalidate cache and fetch fresh data
      await revalidateTag('unity-insights', 'max');
    }

    const data = await getCachedUnityStats(datePreset, gameId);

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

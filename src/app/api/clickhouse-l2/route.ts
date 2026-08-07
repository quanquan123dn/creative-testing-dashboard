import { NextResponse } from 'next/server';
import { getL2CreativeStats } from '@/lib/clickhouse-api';
import { getGameConfig } from '@/lib/game-config';
import { unstable_cache, revalidateTag } from 'next/cache';

const CACHE_DURATION = 600; // 10 minutes

function getCachedL2Stats(campaignName: string, gameId: string) {
  return unstable_cache(
    async () => {
      const data = await getL2CreativeStats(campaignName, gameId);
      return {
        ...data,
        cachedAt: new Date().toISOString(),
      };
    },
    [`l2-ch-${gameId}`],
    {
      revalidate: CACHE_DURATION,
      tags: [`l2-ch-${gameId}`],
    }
  )();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gameId = searchParams.get('game') || 'epic-stickman';
  const force = searchParams.get('force') === 'true';

  try {
    const gameConfig = getGameConfig(gameId);
    const campaignName = gameConfig.meta.layer2CampaignName || gameConfig.meta.layer1CampaignName;

    if (force) {
      await revalidateTag(`l2-ch-${gameId}`, 'max');
    }

    const data = await getCachedL2Stats(campaignName, gameId);

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
    console.error('[L2 API] Error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

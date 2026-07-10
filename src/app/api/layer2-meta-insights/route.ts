import { NextResponse } from 'next/server';
import { getAllAdInsights } from '@/lib/meta-api';
import { unstable_cache, revalidateTag } from 'next/cache';
import { getGameConfig } from '@/lib/game-config';

const CACHE_DURATION = 1800; // 30 minutes

function getCachedLayer2MetaInsights(gameId: string) {
  const gameConfig = getGameConfig(gameId);
  return unstable_cache(
    async () => {
      // Fetch using 'maximum' preset because campaign is from March
      // Pass the specific campaign name for Layer 2
      const campaignName = gameConfig.meta.layer2CampaignName || gameConfig.meta.layer1CampaignName;
      const data = await getAllAdInsights('maximum', campaignName, gameConfig.meta.adAccountId);
      return {
        ...data,
        cachedAt: new Date().toISOString(),
      };
    },
    [`layer2-meta-insights-${gameId}`],
    {
      revalidate: CACHE_DURATION,
      tags: ['layer2-meta-insights', `layer2-meta-insights-${gameId}`],
    }
  )();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gameId = searchParams.get('game') || 'epic-stickman';
  const force = searchParams.get('force') === 'true';

  try {
    if (force) {
      await revalidateTag('layer2-meta-insights', 'max');
    }

    const data = await getCachedLayer2MetaInsights(gameId);

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

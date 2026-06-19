import { NextResponse } from 'next/server';
import { getAllAdInsights } from '@/lib/meta-api';
import { unstable_cache, revalidateTag } from 'next/cache';

const CACHE_DURATION = 1800; // 30 minutes

function getCachedLayer2MetaInsights() {
  return unstable_cache(
    async () => {
      // Fetch using 'maximum' preset because campaign is from March
      // Pass the specific campaign name for Layer 2
      const campaignName = process.env.META_LAYER2_CAMPAIGN_NAME || 'TSH009a_Mar13_US_T3_QuanNHLeo_FB_Layer 2.5 creative test';
      const data = await getAllAdInsights('maximum', campaignName);
      return {
        ...data,
        cachedAt: new Date().toISOString(),
      };
    },
    ['layer2-meta-insights'],
    {
      revalidate: CACHE_DURATION,
      tags: ['layer2-meta-insights'],
    }
  )();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get('force') === 'true';

  try {
    if (force) {
      await revalidateTag('layer2-meta-insights', 'max');
    }

    const data = await getCachedLayer2MetaInsights();

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

import { NextResponse } from 'next/server';
import { getAppLovinCreativeStats } from '@/lib/applovin-api';
import { unstable_cache, revalidateTag } from 'next/cache';

const CACHE_DURATION = 1800; // 30 minutes

function getCachedAppLovinStats() {
  return unstable_cache(
    async () => {
      const data = await getAppLovinCreativeStats();
      return {
        ...data,
        cachedAt: new Date().toISOString(),
      };
    },
    ['applovin-insights'],
    {
      revalidate: CACHE_DURATION,
      tags: ['applovin-insights'],
    }
  )();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get('force') === 'true';

  try {
    if (force) {
      await revalidateTag('applovin-insights', 'max');
    }

    const data = await getCachedAppLovinStats();

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

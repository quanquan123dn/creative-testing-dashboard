import { NextResponse } from 'next/server';
import { getAppsFlyerCreativeStats } from '@/lib/appsflyer-api';
import { unstable_cache, revalidateTag } from 'next/cache';

const CACHE_DURATION = 21600; // 6 hours

function getCachedAppsFlyerStats() {
  return unstable_cache(
    async () => {
      const data = await getAppsFlyerCreativeStats();
      return {
        ...data,
        cachedAt: new Date().toISOString(),
      };
    },
    ['appsflyer-insights'],
    {
      revalidate: CACHE_DURATION,
      tags: ['appsflyer-insights'],
    }
  )();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get('force') === 'true';

  try {
    if (force) {
      await revalidateTag('appsflyer-insights', 'max');
    }

    const data = await getCachedAppsFlyerStats();

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

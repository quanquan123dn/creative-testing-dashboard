import { NextResponse } from 'next/server';
import { getAllAdInsights } from '@/lib/meta-api';
import { unstable_cache, revalidateTag } from 'next/cache';

const VALID_PRESETS = ['today', 'yesterday', 'last_7d', 'last_14d', 'last_30d', 'last_90d', 'maximum'];

// Cache duration: 30 minutes (1800 seconds)
const CACHE_DURATION = 1800;

function getCachedInsights(datePreset: string) {
  return unstable_cache(
    async () => {
      const data = await getAllAdInsights(datePreset);
      return {
        ...data,
        cachedAt: new Date().toISOString(),
      };
    },
    [`meta-insights-${datePreset}`],
    {
      revalidate: CACHE_DURATION,
      tags: ['meta-insights', `meta-insights-${datePreset}`],
    }
  )();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawPreset = searchParams.get('date_preset') || 'last_7d';
  const datePreset = VALID_PRESETS.includes(rawPreset) ? rawPreset : 'last_7d';
  const force = searchParams.get('force') === 'true';

  try {
    if (force) {
      // Invalidate cache and fetch fresh data
      await revalidateTag('meta-insights', 'max');
    }

    const data = await getCachedInsights(datePreset);

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

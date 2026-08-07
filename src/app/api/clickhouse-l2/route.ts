import { NextResponse } from 'next/server';
import { getL2CreativeStats, ClickHouseL2Ad } from '@/lib/clickhouse-api';
import { getAFCohortBuyerDataChunked, AFCohortRow } from '@/lib/af-cohort-api';
import { getGameConfig } from '@/lib/game-config';
import { unstable_cache, revalidateTag } from 'next/cache';

const CACHE_DURATION = 600; // 10 minutes

/**
 * Merge AppsFlyer buyer data (primary, accurate) with ClickHouse metrics.
 * AF provides: buyer_rate_d3, unique_buyers_d3 (grouped by af_adset, aggregated by creative code)
 * CH provides: installs, cost, impressions, clicks, revenue, ctr, cpm, cpi, ipm
 */
function mergeAFWithCH(chAds: ClickHouseL2Ad[], afRows: AFCohortRow[]): ClickHouseL2Ad[] {
  // Build AF lookup by exact adset name (case-insensitive)
  // Layer 2 campaign adsets have simple names (VE0209, VE0271, etc.)
  // This naturally filters out other campaigns whose adsets have longer names
  const afByName: Record<string, AFCohortRow> = {};
  afRows.forEach(r => {
    if (r.adset_name && r.users > 0) {
      afByName[r.adset_name.toLowerCase()] = r;
    }
  });

  return chAds.map(ad => {
    // Try exact match: CH ad_name === AF adset_name
    const afMatch = afByName[ad.ad_name.toLowerCase()];
    if (afMatch && afMatch.buyer_rate_d3 >= 0) {
      return {
        ...ad,
        buyer_rate_d3: afMatch.buyer_rate_d3,
        iap_buyer_d3: afMatch.unique_buyers_d3,
      };
    }

    // No AF match — keep ClickHouse data as fallback
    return ad;
  });
}

function getCachedL2Stats(campaignName: string, gameId: string, campaignStartDate: string) {
  return unstable_cache(
    async () => {
      // Fetch both sources in parallel
      const [chData, afRows] = await Promise.all([
        getL2CreativeStats(campaignName, gameId),
        getAFCohortBuyerDataChunked(campaignStartDate).catch(err => {
          console.error('[AF Cohort] Error:', err.message);
          return [] as AFCohortRow[];
        }),
      ]);

      // Merge: AF buyer data + CH everything else
      const mergedAds = mergeAFWithCH(chData.ads, afRows);

      // Count exact name matches
      const afNames = new Set(afRows.map(r => r.adset_name.toLowerCase()));
      const afMatchedCount = chData.ads.filter(ad => afNames.has(ad.ad_name.toLowerCase())).length;

      return {
        campaign: chData.campaign,
        ads: mergedAds,
        queriedAt: chData.queriedAt,
        afMatched: afMatchedCount,
        afTotal: afRows.length,
        cachedAt: new Date().toISOString(),
      };
    },
    [`l2-merged-${gameId}`],
    {
      revalidate: CACHE_DURATION,
      tags: [`l2-merged-${gameId}`],
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
    // Campaign start date — used for AF chunked query
    const campaignStartDate = gameConfig.meta.layer2StartDate || '2026-01-15';

    if (force) {
      await revalidateTag(`l2-merged-${gameId}`, 'max');
    }

    const data = await getCachedL2Stats(campaignName, gameId, campaignStartDate);

    return NextResponse.json({
      success: true,
      data,
      cache: {
        cachedAt: data.cachedAt,
        revalidateSeconds: CACHE_DURATION,
        forced: force,
      },
      sources: {
        appsflyer: { matched: data.afMatched, total: data.afTotal },
        clickhouse: { total: data.ads.length },
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

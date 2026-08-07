import { NextResponse } from 'next/server';
import { getL2CreativeStats, ClickHouseL2Ad } from '@/lib/clickhouse-api';
import { getAFCohortBuyerDataChunked, AFCohortRow } from '@/lib/af-cohort-api';
import { getGameConfig } from '@/lib/game-config';
import { extractCreativeCode } from '@/lib/utils';
import { unstable_cache, revalidateTag } from 'next/cache';

const CACHE_DURATION = 600; // 10 minutes

/**
 * Merge AppsFlyer buyer data (primary, accurate) with ClickHouse metrics.
 * AF provides: buyer_rate_d3, unique_buyers_d3 (grouped by af_adset, aggregated by creative code)
 * CH provides: installs, cost, impressions, clicks, revenue, ctr, cpm, cpi, ipm
 */
function mergeAFWithCH(chAds: ClickHouseL2Ad[], afRows: AFCohortRow[]): ClickHouseL2Ad[] {
  // Aggregate AF rows by creative code (one code can appear in many adsets)
  const afByCode: Record<string, { totalUsers: number; totalBuyers: number; totalRevenue: number }> = {};

  afRows.forEach(r => {
    const code = extractCreativeCode(r.adset_name);
    if (!code) return;
    const key = code.toUpperCase();
    if (!afByCode[key]) {
      afByCode[key] = { totalUsers: 0, totalBuyers: 0, totalRevenue: 0 };
    }
    afByCode[key].totalUsers += r.users;
    afByCode[key].totalBuyers += r.unique_buyers_d3;
    afByCode[key].totalRevenue += r.purchase_revenue_d3;
  });

  return chAds.map(ad => {
    const adCode = extractCreativeCode(ad.ad_name);
    if (!adCode) return ad;

    const afAgg = afByCode[adCode.toUpperCase()];
    if (afAgg && afAgg.totalUsers > 0) {
      return {
        ...ad,
        buyer_rate_d3: (afAgg.totalBuyers / afAgg.totalUsers) * 100,
        iap_buyer_d3: afAgg.totalBuyers,
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

      // Count matches
      const afCodes = new Set(
        afRows.map(r => extractCreativeCode(r.adset_name).toUpperCase()).filter(Boolean)
      );
      const afMatchedCount = chData.ads.filter(ad => {
        const code = extractCreativeCode(ad.ad_name);
        return code && afCodes.has(code.toUpperCase());
      }).length;

      return {
        campaign: chData.campaign,
        ads: mergedAds,
        queriedAt: chData.queriedAt,
        afMatched: afMatchedCount,
        afTotal: afRows.length,
        afUniqueCreatives: afCodes.size,
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
        appsflyer: { matched: data.afMatched, total: data.afTotal, uniqueCreatives: data.afUniqueCreatives },
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

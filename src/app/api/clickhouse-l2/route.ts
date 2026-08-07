import { NextResponse } from 'next/server';
import { getL2CreativeStats, ClickHouseL2Ad } from '@/lib/clickhouse-api';
import { getAFCohortBuyerData, AFCohortRow } from '@/lib/af-cohort-api';
import { getGameConfig } from '@/lib/game-config';
import { extractCreativeCode } from '@/lib/utils';
import { unstable_cache, revalidateTag } from 'next/cache';

const CACHE_DURATION = 600; // 10 minutes

/**
 * Merge AppsFlyer (primary, accurate but ~3 days delayed) with ClickHouse (secondary, realtime).
 * For each creative:
 *   - If AF has data → use AF buyer_rate_d3, unique_buyers_d3
 *   - If AF doesn't have data (too recent) → fall back to ClickHouse overview data
 * ClickHouse always provides: installs, cost, impressions, clicks, revenue, ctr, cpm, cpi, ipm
 */
function mergeAFWithCH(chAds: ClickHouseL2Ad[], afRows: AFCohortRow[]): ClickHouseL2Ad[] {
  // Aggregate AF rows by creative code (one creative can appear in many adsets)
  // e.g. VE0209 appears as "Videos_PLAs_TSH009_VE0209_..._Mintegral", "Videos_PLAs_TSH009_VE0209_..._1200x628", etc.
  const afByCode: Record<string, { totalUsers: number; totalBuyers: number; totalRevenue: number; totalCost: number }> = {};

  afRows.forEach(r => {
    const code = extractCreativeCode(r.adset_name);
    if (!code) return;
    const key = code.toLowerCase();
    if (!afByCode[key]) {
      afByCode[key] = { totalUsers: 0, totalBuyers: 0, totalRevenue: 0, totalCost: 0 };
    }
    afByCode[key].totalUsers += r.users;
    afByCode[key].totalBuyers += r.unique_buyers_d3;
    afByCode[key].totalRevenue += r.purchase_revenue_d3;
    afByCode[key].totalCost += r.cost;
  });

  return chAds.map(ad => {
    const adCode = extractCreativeCode(ad.ad_name);
    if (!adCode) return ad;

    const afAgg = afByCode[adCode.toLowerCase()];
    if (afAgg && afAgg.totalUsers > 0) {
      const buyer_rate_d3 = (afAgg.totalBuyers / afAgg.totalUsers) * 100;
      return {
        ...ad,
        buyer_rate_d3,
        iap_buyer_d3: afAgg.totalBuyers,
      };
    }

    // No AF match — keep ClickHouse data as fallback
    return ad;
  });
}

function getCachedL2Stats(campaignName: string, gameId: string) {
  return unstable_cache(
    async () => {
      // Calculate date range for AF query: campaign start to 3 days ago
      const now = new Date();
      const threeDaysAgo = new Date(now);
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      const sixtyDaysAgo = new Date(now);
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      const fromDate = sixtyDaysAgo.toISOString().split('T')[0];
      const toDate = threeDaysAgo.toISOString().split('T')[0];

      // Fetch both sources in parallel
      let afError: string | null = null;
      const [chData, afRows] = await Promise.all([
        getL2CreativeStats(campaignName, gameId),
        getAFCohortBuyerData(fromDate, toDate).catch(err => {
          afError = err.message;
          console.error('[AF Cohort] Error:', err.message);
          return [] as AFCohortRow[];
        }),
      ]);

      // Merge: AF primary, CH fallback
      const mergedAds = mergeAFWithCH(chData.ads, afRows);

      // Count how many CH ads matched AF data
      const afByCode = Object.keys(
        afRows.reduce((acc, r) => {
          const code = extractCreativeCode(r.adset_name);
          if (code) acc[code.toLowerCase()] = true;
          return acc;
        }, {} as Record<string, boolean>)
      );
      const afMatchedCount = chData.ads.filter(ad => {
        const code = extractCreativeCode(ad.ad_name);
        return code && afByCode.includes(code.toLowerCase());
      }).length;

      return {
        campaign: chData.campaign,
        ads: mergedAds,
        queriedAt: chData.queriedAt,
        afMatched: afMatchedCount,
        afTotal: afRows.length,
        afUniqueCreatives: afByCode.length,
        afError,
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

    if (force) {
      await revalidateTag(`l2-merged-${gameId}`, 'max');
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

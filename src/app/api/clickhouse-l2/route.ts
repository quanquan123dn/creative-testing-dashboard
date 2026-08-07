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
  // Build AF lookup by creative name (multiple strategies)
  const afMap: Record<string, AFCohortRow> = {};
  afRows.forEach(r => {
    if (r.adset_name) {
      afMap[r.adset_name.toLowerCase()] = r;
    }
  });

  return chAds.map(ad => {
    const adNameLower = ad.ad_name.toLowerCase();
    const adCode = extractCreativeCode(ad.ad_name);

    // Match AF data: exact name, creative code, or substring
    let afMatch: AFCohortRow | undefined;

    // 1. Exact name match
    afMatch = afMap[adNameLower];

    // 2. Creative code match (VE0209 === VE0209)
    if (!afMatch && adCode) {
      afMatch = afRows.find(r => {
        const afCode = extractCreativeCode(r.adset_name);
        return afCode && afCode === adCode;
      });
    }

    // 3. Substring match
    if (!afMatch) {
      afMatch = afRows.find(r => {
        const afNameLower = r.adset_name.toLowerCase();
        return adNameLower.includes(afNameLower) || afNameLower.includes(adNameLower);
      });
    }

    if (afMatch && afMatch.buyer_rate_d3 > 0) {
      // Use AF data as primary for buyer metrics
      return {
        ...ad,
        buyer_rate_d3: afMatch.buyer_rate_d3,
        iap_buyer_d3: afMatch.unique_buyers_d3,
        // Also use AF ROAS if available: purchase_revenue / cost * 100
        roas_d3: ad.cost > 0 ? (afMatch.purchase_revenue_d3 / ad.cost) * 100 : ad.roas_d3,
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
      const fromDate = '2026-01-01'; // Far enough back to cover all campaigns
      const toDate = threeDaysAgo.toISOString().split('T')[0];

      // Fetch both sources in parallel
      const [chData, afRows] = await Promise.all([
        getL2CreativeStats(campaignName, gameId),
        getAFCohortBuyerData(fromDate, toDate).catch(err => {
          console.error('[AF Cohort] Error:', err.message);
          return [] as AFCohortRow[];
        }),
      ]);

      // Merge: AF primary, CH fallback
      const mergedAds = mergeAFWithCH(chData.ads, afRows);

      return {
        campaign: chData.campaign,
        ads: mergedAds,
        queriedAt: chData.queriedAt,
        afMatched: mergedAds.filter((_, i) => {
          const adCode = extractCreativeCode(chData.ads[i]?.ad_name || '');
          return afRows.some(r => extractCreativeCode(r.adset_name) === adCode);
        }).length,
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

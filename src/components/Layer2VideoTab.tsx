'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { AppsFlyerAd } from '@/lib/appsflyer-api';
import { scoreAppLovinCreative, APPLOVIN_DEFAULT_CONFIG, FB_LAYER2_DEFAULT_CONFIG, AppLovinDecisionConfig, AppLovinDecisionResult } from '@/lib/applovin-decision-engine';

interface EnrichedAd extends AppsFlyerAd {
  has_af_data: boolean;
  decision_result: AppLovinDecisionResult;
}

type SortKey = 'ad_name' | 'cost' | 'impressions' | 'installs' | 'roi' | 'buyer_rate' | 'purchasers' | 'ctr' | 'cpm' | 'cpi' | 'revenue';

export default function Layer2VideoTab() {
  const [ads, setAds] = useState<EnrichedAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('roi');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [config] = useState<AppLovinDecisionConfig>(FB_LAYER2_DEFAULT_CONFIG);

  const fetchData = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const forceParam = force ? '?force=true' : '';
      
      const [afRes, metaRes] = await Promise.all([
        fetch(`/api/appsflyer-insights${forceParam}`),
        fetch(`/api/layer2-meta-insights${forceParam}`)
      ]);
      
      const afJson = await afRes.json();
      const metaJson = await metaRes.json();
      
      if (!metaJson.success) throw new Error(metaJson.error || 'Failed to fetch Meta data');
      if (!afJson.success) {
        console.warn('AppsFlyer API failed:', afJson.error);
      }

      const afAds: AppsFlyerAd[] = afJson.success ? (afJson.data?.ads || []) : [];
      const metaAds = metaJson.data?.ads || [];

      const enriched: EnrichedAd[] = metaAds.map((metaAd: any) => {
        const afAd = afAds.find(a => a.ad_name === metaAd.ad_name);
        
        const spend = metaAd.spend || 0;
        const impressions = metaAd.impressions || 0;
        const installs = metaAd.installs || 0;
        const cpm = metaAd.cpm || 0;
        const cpi = metaAd.cpi || 0;
        const ctr = metaAd.ctr || 0;

        const roi = afAd ? afAd.roi : 0;
        const purchasers = afAd ? afAd.purchasers : 0;
        const buyer_rate = afAd ? afAd.buyer_rate : 0;
        const revenue = afAd ? afAd.revenue : 0;

        return {
          ad_name: metaAd.ad_name,
          campaign: metaAd.campaign || 'Layer 2',
          media_source: 'Facebook',
          impressions,
          clicks: metaAd.clicks || 0,
          installs,
          cost: spend,
          revenue,
          roi,
          purchasers,
          purchase_revenue: revenue,
          ctr,
          cpi,
          cpm,
          buyer_rate,
          has_af_data: !!afAd,
          decision_result: scoreAppLovinCreative({
            roas_3d: roi,
            buyer_rate: buyer_rate,
            spend,
            installs,
            cost: spend,
            sales_3d: purchasers,
          }, config),
        };
      });

      setAds(enriched);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sortedAds = useMemo(() => {
    return [...ads].sort((a, b) => {
      const aVal = (a as any)[sortKey];
      const bVal = (b as any)[sortKey];
      if (typeof aVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [ads, sortKey, sortDir]);

  const totalSpend = ads.reduce((s, a) => s + a.cost, 0);
  const totalInstalls = ads.reduce((s, a) => s + a.installs, 0);
  const totalRevenue = ads.reduce((s, a) => s + a.revenue, 0);
  const totalPurchasers = ads.reduce((s, a) => s + a.purchasers, 0);
  const totalImpressions = ads.reduce((s, a) => s + a.impressions, 0);
  const overallROI = totalSpend > 0 ? (totalRevenue / totalSpend) * 100 : 0;
  const overallBuyerRate = totalInstalls > 0 ? (totalPurchasers / totalInstalls) * 100 : 0;
  const avgCPI = totalInstalls > 0 ? totalSpend / totalInstalls : 0;
  const winners = ads.filter(a => a.decision_result.decision === 'winner').length;
  const watching = ads.filter(a => a.decision_result.decision === 'watching').length;
  const fails = ads.filter(a => a.decision_result.decision === 'fail').length;
  const total = ads.length;
  const maxROI = Math.max(...ads.map(a => a.roi), 100);

  const formatCurrency = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toFixed(2)}`;

  const sortArrow = (key: SortKey) => {
    if (sortKey !== key) return null;
    return <span style={{ color: '#60a5fa', fontSize: '10px' }}> {sortDir === 'asc' ? '\u2191' : '\u2193'}</span>;
  };

  const columns: { key: SortKey; label: string; align?: 'right' | 'left'; width?: string }[] = [
    { key: 'ad_name', label: 'Ad Creative', align: 'left', width: '180px' },
    { key: 'cost', label: 'Spend', align: 'right', width: '85px' },
    { key: 'impressions', label: 'Impr', align: 'right', width: '80px' },
    { key: 'installs', label: 'Installs', align: 'right', width: '70px' },
    { key: 'roi', label: 'ROI', align: 'right', width: '90px' },
    { key: 'buyer_rate', label: 'Buyer Rate', align: 'right', width: '85px' },
    { key: 'purchasers', label: 'Purchasers', align: 'right', width: '80px' },
    { key: 'revenue', label: 'Revenue', align: 'right', width: '80px' },
    { key: 'ctr', label: 'CTR', align: 'right', width: '65px' },
    { key: 'cpm', label: 'CPM', align: 'right', width: '70px' },
    { key: 'cpi', label: 'CPI', align: 'right', width: '70px' },
  ];

  const getRoiColor = (roi: number) => {
    if (roi >= 68) return '#10b981';
    if (roi >= 40) return '#f59e0b';
    if (roi > 0) return '#ef4444';
    return '#475569';
  };

  const kpiCards = [
    { id: 'l2v-spend', icon: '\ud83d\udcb0', label: 'Total Spend', value: formatCurrency(totalSpend), color: '#8b5cf6', sub: `${ads.length} ads` },
    { id: 'l2v-roi', icon: '\ud83d\udcc8', label: 'Overall ROI', value: `${overallROI.toFixed(1)}%`, color: getRoiColor(overallROI), sub: `Benchmark: 68%`, highlight: true },
    { id: 'l2v-buyer', icon: '\ud83d\uded2', label: 'Buyer Rate', value: `${overallBuyerRate.toFixed(1)}%`, color: overallBuyerRate >= 9.5 ? '#10b981' : overallBuyerRate >= 6 ? '#f59e0b' : '#ef4444', sub: `Benchmark: 9.5%` },
    { id: 'l2v-installs', icon: '\ud83d\udcf2', label: 'Total Installs', value: totalInstalls.toLocaleString(), color: '#06b6d4', sub: `${totalPurchasers} purchasers` },
    { id: 'l2v-revenue', icon: '\ud83d\udcb5', label: 'Revenue', value: formatCurrency(totalRevenue), color: '#10b981', sub: `CPI: $${avgCPI.toFixed(2)}` },
    { id: 'l2v-decisions', icon: '\ud83c\udfc6', label: 'Decisions', color: '#8b5cf6', sub: `${winners + watching + fails} scored`, isDecision: true, winners, watching, fails },
  ];

  const testedAds = ads.filter(a => a.purchasers >= 10);
  const roiLeaderboard = [...testedAds].sort((a, b) => b.roi - a.roi).slice(0, 5).map(a => ({ name: a.ad_name, value: a.roi, formatted: `${a.roi.toFixed(1)}%` }));
  const buyerLeaderboard = [...testedAds].sort((a, b) => b.buyer_rate - a.buyer_rate).slice(0, 5).map(a => ({ name: a.ad_name, value: a.buyer_rate, formatted: `${a.buyer_rate.toFixed(1)}%` }));

  return (
    <div className="space-y-5 fade-in-up">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpiCards.map((card: any) => (
          <div key={card.id} id={card.id} className="glass-card p-4 fade-in-up" style={{ borderLeft: `2px solid ${card.color}30` }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-base">{card.icon}</span>
              <span className="w-2 h-2 rounded-full" style={{ background: card.color, opacity: 0.7 }} />
            </div>
            <div className="text-xs mb-1" style={{ color: '#64748b' }}>{card.label}</div>
            {loading ? (
              <div className="h-6 rounded shimmer" />
            ) : card.isDecision ? (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-sm font-bold" style={{ color: '#10b981' }}>{card.winners}🏆</span>
                <span className="text-sm font-bold" style={{ color: '#f59e0b' }}>{card.watching}⏳</span>
                <span className="text-sm font-bold" style={{ color: '#ef4444' }}>{card.fails}❌</span>
              </div>
            ) : (
              <div className="text-lg font-bold" style={{ color: card.highlight ? getRoiColor(overallROI) : card.color }}>
                {card.value}
              </div>
            )}
            {!loading && card.sub && (
              <div className="text-[11px] mt-1" style={{ color: '#94a3b8' }}>{card.sub}</div>
            )}
          </div>
        ))}
      </div>

      {/* Leaderboard */}
      {!loading && testedAds.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="glass-card p-4">
            <h3 className="text-sm font-semibold text-slate-200 mb-3">🏆 Top ROI</h3>
            {roiLeaderboard.map((item, i) => {
              const max = Math.max(...roiLeaderboard.map(x => x.value), 100);
              return (
                <div key={i} className="mb-2">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-slate-300 truncate mr-2">{i + 1}. {item.name}</span>
                    <span className="text-xs font-bold" style={{ color: '#10b981' }}>{item.formatted}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#1e2d4a' }}>
                    <div className="h-full rounded-full" style={{ width: `${(item.value / max) * 100}%`, background: '#10b981' }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="glass-card p-4">
            <h3 className="text-sm font-semibold text-slate-200 mb-3">🛒 Top Buyer Rate</h3>
            {buyerLeaderboard.map((item, i) => {
              const max = Math.max(...buyerLeaderboard.map(x => x.value), 10);
              return (
                <div key={i} className="mb-2">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-slate-300 truncate mr-2">{i + 1}. {item.name}</span>
                    <span className="text-xs font-bold" style={{ color: '#8b5cf6' }}>{item.formatted}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#1e2d4a' }}>
                    <div className="h-full rounded-full" style={{ width: `${(item.value / max) * 100}%`, background: '#8b5cf6' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-slate-200">🎬 Layer 2 Video (Facebook) Performance</h2>
            {!loading && (
              <span className="px-2.5 py-1 rounded-full text-xs font-medium" style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)', color: '#60a5fa' }}>
                {ads.length} ads
              </span>
            )}
            <button onClick={() => fetchData(true)} disabled={loading}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)', color: '#60a5fa', opacity: loading ? 0.5 : 1 }}
            >
              {loading ? '⏳ Syncing...' : '🔄 Sync'}
            </button>
          </div>
          <div className="text-xs" style={{ color: '#64748b' }}>Last 14 days (via AppsFlyer)</div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg text-xs" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}>
            ⚠️ {error}
          </div>
        )}

        <div className="overflow-x-auto" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr style={{ background: '#0f1629' }}>
                <th className="px-3 py-3 text-left text-xs font-medium" style={{ color: '#64748b', width: '40px' }}>#</th>
                {columns.map(col => (
                  <th key={col.key}
                    className={`px-3 py-3 text-xs font-medium cursor-pointer hover:text-slate-300 transition-colors ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                    style={{ color: sortKey === col.key ? '#60a5fa' : '#64748b', width: col.width }}
                    onClick={() => handleSort(col.key)}
                  >
                    {col.label}{sortArrow(col.key)}
                  </th>
                ))}
                <th className="px-3 py-3 text-left text-xs font-medium" style={{ color: '#64748b', width: '70px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #1e2d4a' }}>
                    {Array.from({ length: 13 }).map((_, j) => (
                      <td key={j} className="px-3 py-3"><div className="h-4 rounded shimmer" /></td>
                    ))}
                  </tr>
                ))
              ) : sortedAds.length === 0 ? (
                <tr><td colSpan={13} className="px-3 py-12 text-center text-sm" style={{ color: '#64748b' }}>No ad data found</td></tr>
              ) : (
                sortedAds.map((ad, idx) => {
                  const dr = ad.decision_result;
                  return (
                    <tr key={`${ad.ad_name}-${idx}`} className="transition-colors"
                      style={{ borderBottom: '1px solid #1e2d4a', background: idx % 2 === 0 ? 'transparent' : 'rgba(15,22,41,0.3)' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(59,130,246,0.04)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = idx % 2 === 0 ? 'transparent' : 'rgba(15,22,41,0.3)'; }}
                    >
                      <td className="px-3 py-3 text-xs" style={{ color: '#475569' }}>{idx + 1}</td>
                      <td className="px-3 py-3 text-left">
                        <div className="font-medium text-slate-200 text-xs truncate" title={ad.ad_name}>{ad.ad_name}</div>
                      </td>
                      <td className="px-3 py-3 text-right text-xs" style={{ color: '#94a3b8' }}>{formatCurrency(ad.cost)}</td>
                      <td className="px-3 py-3 text-right text-xs" style={{ color: '#94a3b8' }}>{ad.impressions.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right text-xs font-medium" style={{ color: '#e2e8f0' }}>{ad.installs.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-12 h-1.5 rounded-full overflow-hidden" style={{ background: '#1e2d4a' }}>
                            <div className="h-full rounded-full transition-all" style={{ width: `${maxROI > 0 ? Math.min((ad.roi / maxROI) * 100, 100) : 0}%`, background: getRoiColor(ad.roi) }} />
                          </div>
                          <span className="text-xs font-bold" style={{ color: getRoiColor(ad.roi), minWidth: '45px', textAlign: 'right' }}>
                            {ad.has_af_data ? `${ad.roi.toFixed(1)}%` : 'N/A'}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right text-xs font-medium" style={{ color: ad.buyer_rate >= 5 ? '#10b981' : ad.buyer_rate >= 3 ? '#f59e0b' : '#94a3b8' }}>
                        {ad.has_af_data ? (ad.buyer_rate > 0 ? `${ad.buyer_rate.toFixed(1)}%` : '\u2014') : 'N/A'}
                      </td>
                      <td className="px-3 py-3 text-right text-xs" style={{ color: '#94a3b8' }}>{ad.has_af_data ? (ad.purchasers > 0 ? ad.purchasers : '\u2014') : 'N/A'}</td>
                      <td className="px-3 py-3 text-right text-xs" style={{ color: '#94a3b8' }}>{ad.has_af_data ? formatCurrency(ad.revenue) : 'N/A'}</td>
                      <td className="px-3 py-3 text-right text-xs" style={{ color: '#94a3b8' }}>{ad.ctr.toFixed(2)}%</td>
                      <td className="px-3 py-3 text-right text-xs" style={{ color: '#94a3b8' }}>{formatCurrency(ad.cpm)}</td>
                      <td className="px-3 py-3 text-right text-xs" style={{ color: '#94a3b8' }}>{ad.installs > 0 ? formatCurrency(ad.cpi) : '\u2014'}</td>
                      <td className="px-3 py-3">
                        <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
                          style={{ background: dr.hexBg, border: `1px solid ${dr.hexBorder}`, color: dr.hexColor }}
                          title={dr.reason}
                        >
                          {dr.emoji} {dr.label}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Distribution */}
      {!loading && total > 0 && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-4">📊 Layer 2 Video Distribution</h3>
          <div className="flex items-center gap-6">
            <div className="flex-1">
              <div className="flex rounded-full overflow-hidden h-4" style={{ background: '#1e2d4a' }}>
                {winners > 0 && <div style={{ width: `${(winners / total) * 100}%`, background: '#10b981' }} className="transition-all" />}
                {watching > 0 && <div style={{ width: `${(watching / total) * 100}%`, background: '#f59e0b' }} className="transition-all" />}
                {fails > 0 && <div style={{ width: `${(fails / total) * 100}%`, background: '#ef4444' }} className="transition-all" />}
                {(total - winners - watching - fails) > 0 && <div style={{ width: `${((total - winners - watching - fails) / total) * 100}%`, background: '#3b82f6' }} className="transition-all" />}
              </div>
            </div>
            <div className="flex gap-4 text-xs">
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded" style={{ background: '#10b981' }} /><span style={{ color: '#94a3b8' }}>Pass ({winners})</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded" style={{ background: '#f59e0b' }} /><span style={{ color: '#94a3b8' }}>Iterate ({watching})</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded" style={{ background: '#ef4444' }} /><span style={{ color: '#94a3b8' }}>Fail ({fails})</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded" style={{ background: '#3b82f6' }} /><span style={{ color: '#94a3b8' }}>New ({total - winners - watching - fails})</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

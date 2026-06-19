'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { AppLovinCreativeSet } from '@/lib/applovin-api';
import { scoreAppLovinCreative, APPLOVIN_DEFAULT_CONFIG, AppLovinDecisionConfig, AppLovinDecisionResult } from '@/lib/applovin-decision-engine';
import { extractCreativeCode } from '@/lib/utils';
import { DollarSign, TrendingUp, ShoppingCart, Download, Trophy, Banknote, AlertCircle, XCircle, Clock } from 'lucide-react';

interface EnrichedAppLovinAd extends AppLovinCreativeSet {
  decision_result: AppLovinDecisionResult;
}

type SortKey = 'creative_set' | 'cost' | 'impressions' | 'installs' | 'roas_3d' | 'buyer_rate' | 'sales_3d' | 'ctr' | 'cpm' | 'cpi' | 'ir';

export default function AppLovinTab() {
  const [ads, setAds] = useState<EnrichedAppLovinAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('roas_3d');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [config] = useState<AppLovinDecisionConfig>(APPLOVIN_DEFAULT_CONFIG);

  const fetchData = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const forceParam = force ? '?force=true' : '';
      const res = await fetch(`/api/applovin-insights${forceParam}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      const enriched: EnrichedAppLovinAd[] = (json.data.ads || [])
        .filter((ad: AppLovinCreativeSet) => ad.cost > 0)
        .map((ad: AppLovinCreativeSet) => ({
        ...ad,
        decision_result: scoreAppLovinCreative({
          roas_3d: ad.roas_3d,
          buyer_rate: ad.buyer_rate,
          spend: ad.cost,
          installs: ad.installs,
          cost: ad.cost,
          sales_3d: ad.sales_3d,
        }, config),
      }));

      setAds(enriched);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch AppLovin data');
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
        const aCode = extractCreativeCode(aVal);
        const bCode = extractCreativeCode(bVal as string);
        return sortDir === 'asc' ? aCode.localeCompare(bCode) : bCode.localeCompare(aCode);
      }
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [ads, sortKey, sortDir]);

  // KPI aggregations
  const totalSpend = ads.reduce((s, a) => s + a.cost, 0);
  const totalInstalls = ads.reduce((s, a) => s + a.installs, 0);
  const totalSales3d = ads.reduce((s, a) => s + a.sales_3d, 0);
  const totalImpressions = ads.reduce((s, a) => s + a.impressions, 0);
  const avgRoas3d = ads.filter(a => a.cost > 0).length > 0
    ? ads.reduce((s, a) => s + a.roas_3d * a.cost, 0) / ads.reduce((s, a) => s + (a.cost > 0 ? a.cost : 0), 0) || 0
    : 0;
  const avgBuyerRate = totalInstalls > 0 ? (totalSales3d / totalInstalls) * 100 : 0;
  const avgCPI = totalInstalls > 0 ? totalSpend / totalInstalls : 0;
  const winners = ads.filter(a => a.decision_result.decision === 'winner').length;
  const watching = ads.filter(a => a.decision_result.decision === 'watching').length;
  const fails = ads.filter(a => a.decision_result.decision === 'fail').length;
  const total = ads.length;
  const maxROAS = Math.max(...ads.map(a => a.roas_3d), 100);

  const formatCurrency = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toFixed(2)}`;

  const sortArrow = (key: SortKey) => {
    if (sortKey !== key) return null;
    return <span style={{ color: '#60a5fa', fontSize: '10px' }}> {sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  const columns: { key: SortKey; label: string; align?: 'right' | 'left'; width?: string }[] = [
    { key: 'creative_set', label: 'Creative Set', align: 'left', width: '180px' },
    { key: 'cost', label: 'Spend', align: 'right', width: '85px' },
    { key: 'impressions', label: 'Impr', align: 'right', width: '85px' },
    { key: 'installs', label: 'Installs', align: 'right', width: '75px' },
    { key: 'roas_3d', label: 'ROAS D3', align: 'right', width: '90px' },
    { key: 'buyer_rate', label: 'Buyer Rate', align: 'right', width: '85px' },
    { key: 'sales_3d', label: 'D3 Purchasers', align: 'right', width: '85px' },
    { key: 'ctr', label: 'CTR', align: 'right', width: '70px' },
    { key: 'cpm', label: 'CPM', align: 'right', width: '75px' },
    { key: 'cpi', label: 'CPI', align: 'right', width: '75px' },
  ];

  // KPI cards data
  const kpiCards = [
    { id: 'alv-spend', icon: <DollarSign size={20} />, label: 'Total Spend', value: formatCurrency(totalSpend), color: '#8b5cf6', sub: `${ads.length} creative sets` },
    { id: 'alv-roas', icon: <TrendingUp size={20} />, label: 'Avg ROAS D3', value: `${avgRoas3d.toFixed(1)}%`, color: avgRoas3d >= 57.8 ? '#10b981' : avgRoas3d >= 40 ? '#f59e0b' : '#ef4444', sub: `Benchmark: 57.8%`, highlight: true },
    { id: 'alv-buyer', icon: <ShoppingCart size={20} />, label: 'Avg Buyer Rate', value: `${avgBuyerRate.toFixed(1)}%`, color: avgBuyerRate >= 5.6 ? '#10b981' : avgBuyerRate >= 4.1 ? '#f59e0b' : '#ef4444', sub: `Benchmark: 5.6%` },
    { id: 'alv-installs', icon: <Download size={20} />, label: 'Total Installs', value: totalInstalls.toLocaleString(), color: '#06b6d4', sub: `${totalSales3d} purchasers D3` },
    { id: 'alv-cpi', icon: <Banknote size={20} />, label: 'Avg CPI', value: `$${avgCPI.toFixed(2)}`, color: '#f59e0b', sub: `${totalImpressions.toLocaleString()} impressions` },
    { id: 'alv-decisions', icon: <Trophy size={20} />, label: 'Decisions', color: '#8b5cf6', sub: `${winners + watching + fails} scored`, isDecision: true, winners, watching, fails },
  ];

  // Leaderboard data - only include creative sets with >= 10 D3 purchasers (test complete)
  const testedAds = ads.filter(a => a.sales_3d >= 10);
  const roasLeaderboard = [...testedAds].sort((a, b) => b.roas_3d - a.roas_3d).slice(0, 5).map(a => ({ name: a.creative_set, value: a.roas_3d, formatted: `${a.roas_3d.toFixed(1)}%` }));
  const buyerLeaderboard = [...testedAds].sort((a, b) => b.buyer_rate - a.buyer_rate).slice(0, 5).map(a => ({ name: a.creative_set, value: a.buyer_rate, formatted: `${a.buyer_rate.toFixed(1)}%` }));

  const getRoasColor = (roas: number) => {
    if (roas >= 57.8) return '#10b981';
    if (roas >= 40) return '#f59e0b';
    if (roas > 0) return '#ef4444';
    return '#475569';
  };

  return (
    <div className="space-y-5 fade-in-up">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpiCards.map((card: any) => (
          <div
            key={card.id}
            id={card.id}
            className="glass-card p-4 fade-in-up"
            style={{ borderLeft: `2px solid ${card.color}30` }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-base">{card.icon}</span>
              <span className="w-2 h-2 rounded-full" style={{ background: card.color, opacity: 0.7 }} />
            </div>
            <div className="text-xs mb-1" style={{ color: '#64748b' }}>{card.label}</div>
            {loading ? (
              <div className="h-6 rounded shimmer" />
            ) : card.isDecision ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold flex items-center gap-1" style={{ color: '#10b981' }}><Trophy size={14}/> {card.winners}</span>
                <span className="text-sm font-bold flex items-center gap-1" style={{ color: '#f59e0b' }}><span className="text-[12px]">⏳</span> {card.watching}</span>
                <span className="text-sm font-bold flex items-center gap-1" style={{ color: '#ef4444' }}><span className="text-[12px]">❌</span> {card.fails}</span>
              </div>
            ) : (
              <div className="text-lg font-bold" style={{ color: card.highlight ? getRoasColor(avgRoas3d) : card.color }}>
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
      {!loading && ads.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="glass-card p-4">
            <h3 className="text-sm font-semibold text-slate-200 mb-3">🏆 Top ROAS D3</h3>
            {roasLeaderboard.map((item, i) => {
              const max = Math.max(...roasLeaderboard.map(x => x.value), 100);
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
            <h2 className="text-base font-semibold text-slate-200">
              🚀 Layer 2 AppLovin Creative Performance
            </h2>
            {!loading && (
              <span className="px-2.5 py-1 rounded-full text-xs font-medium" style={{
                background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa'
              }}>
                {ads.length} creative sets
              </span>
            )}
            <button
              onClick={() => fetchData(true)}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: 'rgba(59,130,246,0.12)',
                border: '1px solid rgba(59,130,246,0.3)',
                color: '#60a5fa',
                opacity: loading ? 0.5 : 1,
              }}
            >
              {loading ? '⏳ Syncing...' : '🔄 Sync'}
            </button>
          </div>
          <div className="text-xs" style={{ color: '#64748b' }}>Last 45 days (API limit)</div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg text-xs" style={{
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5'
          }}>
            ⚠️ {error}
          </div>
        )}

        <div className="overflow-x-auto" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr style={{ background: '#0f1629' }}>
                <th className="px-3 py-3 text-left text-xs font-medium" style={{ color: '#64748b', width: '40px' }}>#</th>
                {columns.map(col => (
                  <th
                    key={col.key}
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
                    {Array.from({ length: 12 }).map((_, j) => (
                      <td key={j} className="px-3 py-3"><div className="h-4 rounded shimmer" /></td>
                    ))}
                  </tr>
                ))
              ) : sortedAds.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-3 py-12 text-center text-sm" style={{ color: '#64748b' }}>
                    No creative data found for this campaign
                  </td>
                </tr>
              ) : (
                sortedAds.map((ad, idx) => {
                  const dr = ad.decision_result;
                  return (
                    <tr
                      key={ad.creative_set_id}
                      className="transition-colors"
                      style={{
                        borderBottom: '1px solid #1e2d4a',
                        background: idx % 2 === 0 ? 'transparent' : 'rgba(15,22,41,0.3)',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(59,130,246,0.04)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = idx % 2 === 0 ? 'transparent' : 'rgba(15,22,41,0.3)'; }}
                    >
                      <td className="px-3 py-3 text-xs" style={{ color: '#475569' }}>{idx + 1}</td>
                      <td className="px-3 py-3 text-left">
                        <div className="font-medium text-slate-200 text-xs truncate" title={ad.creative_set}>{ad.creative_set}</div>
                        <div className="text-[10px] mt-0.5" style={{ color: '#475569' }}>{ad.creative_set_id.slice(0, 12)}...</div>
                      </td>
                      <td className="px-3 py-3 text-right text-xs" style={{ color: '#94a3b8' }}>{formatCurrency(ad.cost)}</td>
                      <td className="px-3 py-3 text-right text-xs" style={{ color: '#94a3b8' }}>{ad.impressions.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right text-xs font-medium" style={{ color: '#e2e8f0' }}>{ad.installs.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-12 h-1.5 rounded-full overflow-hidden" style={{ background: '#1e2d4a' }}>
                            <div className="h-full rounded-full transition-all" style={{ width: `${maxROAS > 0 ? Math.min((ad.roas_3d / maxROAS) * 100, 100) : 0}%`, background: getRoasColor(ad.roas_3d) }} />
                          </div>
                          <span className="text-xs font-bold" style={{ color: getRoasColor(ad.roas_3d), minWidth: '45px', textAlign: 'right' }}>
                            {ad.roas_3d.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right text-xs font-medium" style={{ color: ad.buyer_rate >= 5 ? '#10b981' : ad.buyer_rate >= 3 ? '#f59e0b' : '#94a3b8' }}>
                        {ad.buyer_rate > 0 ? `${ad.buyer_rate.toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-3 py-3 text-right text-xs" style={{ color: '#94a3b8' }}>{ad.sales_3d > 0 ? ad.sales_3d : '—'}</td>
                      <td className="px-3 py-3 text-right text-xs" style={{ color: '#94a3b8' }}>{ad.ctr.toFixed(2)}%</td>
                      <td className="px-3 py-3 text-right text-xs" style={{ color: '#94a3b8' }}>{formatCurrency(ad.cpm)}</td>
                      <td className="px-3 py-3 text-right text-xs" style={{ color: '#94a3b8' }}>{ad.installs > 0 ? formatCurrency(ad.cpi) : '—'}</td>
                      <td className="px-3 py-3">
                        <div
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
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

      {/* Distribution Chart */}
      {!loading && total > 0 && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-4">📊 AppLovin Creative Distribution</h3>
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
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded" style={{ background: '#10b981' }} />
                <span style={{ color: '#94a3b8' }}>Pass ({winners})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded" style={{ background: '#f59e0b' }} />
                <span style={{ color: '#94a3b8' }}>Iterate ({watching})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded" style={{ background: '#ef4444' }} />
                <span style={{ color: '#94a3b8' }}>Fail ({fails})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded" style={{ background: '#3b82f6' }} />
                <span style={{ color: '#94a3b8' }}>New ({total - winners - watching - fails})</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

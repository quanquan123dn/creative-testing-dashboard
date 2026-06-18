'use client';

import { useState, useEffect, useCallback } from 'react';
import { UnityCreativeStat } from '@/lib/unity-api';
import { scorePLACreative, PLA_DEFAULT_CONFIG, PLADecisionConfig, PLADecisionResult, getPLAIPMBarColor } from '@/lib/pla-decision-engine';

interface EnrichedPLA extends UnityCreativeStat {
  decision_result: PLADecisionResult;
}

type SortKey = 'creative_pack_name' | 'views' | 'clicks' | 'installs' | 'spend' | 'ipm' | 'ctr' | 'click_to_install' | 'cpi';

function formatNumber(n: number, decimals = 2): string {
  if (n === 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(decimals);
}

function formatCurrency(n: number): string {
  if (n === 0) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export default function PLATab() {
  const [ads, setAds] = useState<EnrichedPLA[]>([]);
  const [campaignName, setCampaignName] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('ipm');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const config = PLA_DEFAULT_CONFIG;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/unity-insights?date_preset=maximum');
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      const enriched: EnrichedPLA[] = (json.data.creatives || []).map((c: UnityCreativeStat) => ({
        ...c,
        decision_result: scorePLACreative({
          ipm: c.ipm,
          spend: c.spend,
          installs: c.installs,
          views: c.views,
          clicks: c.clicks,
        }, config),
      }));

      setAds(enriched);
      setCampaignName(json.data.campaign?.name || null);
      setLastSync(json.data.lastSync || null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch Unity data');
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sortedAds = [...ads].sort((a, b) => {
    const aVal = (a as any)[sortKey];
    const bVal = (b as any)[sortKey];
    if (typeof aVal === 'string') {
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
  });

  // KPI aggregations
  const totalSpend = ads.reduce((s, a) => s + a.spend, 0);
  const totalViews = ads.reduce((s, a) => s + a.views, 0);
  const totalInstalls = ads.reduce((s, a) => s + a.installs, 0);
  const totalClicks = ads.reduce((s, a) => s + a.clicks, 0);
  const avgIPM = totalViews > 0 ? (totalInstalls / totalViews) * 1000 : 0;
  const avgCTR = totalViews > 0 ? (totalClicks / totalViews) * 100 : 0;
  const avgCPI = totalInstalls > 0 ? totalSpend / totalInstalls : 0;
  const avgC2I = totalClicks > 0 ? (totalInstalls / totalClicks) * 100 : 0;

  const winners = ads.filter(a => a.decision_result.decision === 'winner').length;
  const watching = ads.filter(a => a.decision_result.decision === 'watching').length;
  const kills = ads.filter(a => a.decision_result.decision === 'kill').length;
  const newAds = ads.filter(a => a.decision_result.decision === 'new').length;

  const ipmColor = avgIPM >= config.ipm_winner ? '#10b981' : avgIPM >= config.ipm_watching ? '#f59e0b' : '#ef4444';

  const maxIPM = ads.length > 0 ? Math.max(...ads.map(a => a.ipm)) : 1;

  const kpiCards = [
    { id: 'pla-spend', label: 'Total Spend', value: formatCurrency(totalSpend), sub: `${ads.length} creatives`, icon: '💸', color: '#3b82f6' },
    { id: 'pla-ipm', label: 'Avg IPM', value: formatNumber(avgIPM), sub: `Benchmark: ${config.ipm_winner}`, icon: '📲', color: ipmColor, highlight: true },
    { id: 'pla-ctr', label: 'Avg CTR', value: `${avgCTR.toFixed(2)}%`, sub: `${formatNumber(totalClicks, 0)} clicks`, icon: '👆', color: '#8b5cf6' },
    { id: 'pla-c2i', label: 'Click-to-Install', value: `${avgC2I.toFixed(1)}%`, sub: `${formatNumber(totalInstalls, 0)} installs`, icon: '📦', color: '#06b6d4' },
    { id: 'pla-cpi', label: 'Avg CPI', value: formatCurrency(avgCPI), sub: `${formatNumber(totalViews, 0)} views`, icon: '🎯', color: '#f59e0b' },
    { id: 'pla-decisions', label: 'Decisions', value: '', sub: `${newAds} chưa đủ data`, icon: '🏆', color: '#10b981', isDecision: true },
  ];

  // Distribution chart data
  const total = winners + watching + kills;
  const winnerPct = total > 0 ? (winners / total) * 100 : 0;
  const watchingPct = total > 0 ? (watching / total) * 100 : 0;
  const killPct = total > 0 ? (kills / total) * 100 : 0;

  const sortArrow = (key: SortKey) => {
    if (sortKey !== key) return <span style={{ color: '#475569', fontSize: '10px' }}> ↕</span>;
    return <span style={{ color: '#60a5fa', fontSize: '10px' }}> {sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  const columns: { key: SortKey; label: string; align?: 'right' | 'left' }[] = [
    { key: 'creative_pack_name', label: 'Creative Pack', align: 'left' },
    { key: 'views', label: 'Views', align: 'right' },
    { key: 'clicks', label: 'Clicks', align: 'right' },
    { key: 'installs', label: 'Installs', align: 'right' },
    { key: 'spend', label: 'Spend', align: 'right' },
    { key: 'ipm', label: 'IPM', align: 'right' },
    { key: 'ctr', label: 'CTR', align: 'right' },
    { key: 'click_to_install', label: 'C2I', align: 'right' },
    { key: 'cpi', label: 'CPI', align: 'right' },
  ];

  return (
    <div className="space-y-5 fade-in-up">
      {/* Campaign info bar */}
      {campaignName && (
        <div className="glass-card px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm" style={{ color: '#94a3b8' }}>🖼️ Campaign:</span>
            <span className="text-sm font-semibold text-slate-200">{campaignName}</span>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{
              background: 'rgba(139, 92, 246, 0.12)',
              border: '1px solid rgba(139, 92, 246, 0.3)',
              color: '#a78bfa'
            }}>Unity Ads</span>
          </div>
          <div className="flex items-center gap-3">
            {lastSync && (
              <span className="text-xs" style={{ color: '#475569' }}>
                Synced: {new Date(lastSync).toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={fetchData}
              disabled={loading}
              className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
              style={{
                background: loading ? 'rgba(139,92,246,0.05)' : 'rgba(139,92,246,0.1)',
                border: '1px solid rgba(139,92,246,0.25)',
                color: loading ? '#475569' : '#a78bfa',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? '⏳ Syncing...' : '🔄 Sync Unity'}
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 rounded-xl border text-sm" style={{
          background: 'rgba(239, 68, 68, 0.08)',
          borderColor: 'rgba(239, 68, 68, 0.3)',
          color: '#fca5a5'
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 fade-in-up">
        {kpiCards.map((card) => (
          <div
            key={card.id}
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
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-sm font-bold" style={{ color: '#10b981' }}>{winners}🏆</span>
                <span className="text-sm font-bold" style={{ color: '#f59e0b' }}>{watching}⏳</span>
                <span className="text-sm font-bold" style={{ color: '#ef4444' }}>{kills}❌</span>
              </div>
            ) : (
              <div className="text-lg font-bold" style={{ color: card.highlight ? ipmColor : card.color }}>
                {card.value}
              </div>
            )}
            {!loading && card.sub && (
              <div className="text-[11px] mt-1" style={{ color: '#475569' }}>{card.sub}</div>
            )}
          </div>
        ))}
      </div>

      {/* Creative Table */}
      <div className="glass-card">
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: '#1e2d4a' }}>
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-slate-200">🖼️ PLA Creative Performance</h2>
            {!loading && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{
                background: 'rgba(139,92,246,0.1)',
                border: '1px solid rgba(139,92,246,0.2)',
                color: '#a78bfa'
              }}>
                {ads.length} creatives
              </span>
            )}
          </div>
          <div className="text-xs" style={{ color: '#64748b' }}>All time (since campaign start)</div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'rgba(15,22,41,0.8)' }}>
                <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: '#64748b', width: '40px' }}>
                  #
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: '#64748b', width: '60px' }}>
                  Status
                </th>
                {columns.map(col => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 text-xs font-medium cursor-pointer hover:text-slate-300 transition-colors ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                    style={{ color: sortKey === col.key ? '#60a5fa' : '#64748b' }}
                    onClick={() => handleSort(col.key)}
                  >
                    {col.label}{sortArrow(col.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #1e2d4a' }}>
                    {Array.from({ length: 11 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 rounded shimmer" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : sortedAds.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-sm" style={{ color: '#64748b' }}>
                    No creative data found for this campaign
                  </td>
                </tr>
              ) : (
                sortedAds.map((ad, idx) => {
                  const dr = ad.decision_result;
                  return (
                    <tr
                      key={ad.creative_pack_id}
                      className="transition-colors"
                      style={{
                        borderBottom: '1px solid #1e2d4a',
                        background: idx % 2 === 0 ? 'transparent' : 'rgba(15,22,41,0.3)',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.background = 'rgba(59,130,246,0.04)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background = idx % 2 === 0 ? 'transparent' : 'rgba(15,22,41,0.3)';
                      }}
                    >
                      <td className="px-4 py-3 text-xs" style={{ color: '#475569' }}>{idx + 1}</td>
                      <td className="px-4 py-3">
                        <div
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
                          style={{
                            background: dr.hexBg,
                            border: `1px solid ${dr.hexBorder}`,
                            color: dr.hexColor,
                          }}
                          title={dr.reason}
                        >
                          {dr.emoji} {dr.label}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-left">
                        <div className="font-medium text-slate-200 text-xs">{ad.creative_pack_name}</div>
                        <div className="text-[10px] mt-0.5" style={{ color: '#475569' }}>{ad.creative_pack_id.slice(0, 12)}...</div>
                      </td>
                      <td className="px-4 py-3 text-right text-xs" style={{ color: '#94a3b8' }}>
                        {ad.views.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-xs" style={{ color: '#94a3b8' }}>
                        {ad.clicks.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-medium" style={{ color: '#e2e8f0' }}>
                        {ad.installs.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-xs" style={{ color: '#94a3b8' }}>
                        {formatCurrency(ad.spend)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: '#1e2d4a' }}>
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${maxIPM > 0 ? (ad.ipm / maxIPM) * 100 : 0}%`,
                                background: getPLAIPMBarColor(ad.ipm, config),
                              }}
                            />
                          </div>
                          <span className="text-xs font-bold" style={{ color: getPLAIPMBarColor(ad.ipm, config), minWidth: '40px', textAlign: 'right' }}>
                            {ad.ipm.toFixed(2)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-xs" style={{ color: '#94a3b8' }}>
                        {ad.ctr.toFixed(2)}%
                      </td>
                      <td className="px-4 py-3 text-right text-xs" style={{ color: '#94a3b8' }}>
                        {ad.click_to_install.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-right text-xs" style={{ color: '#94a3b8' }}>
                        {formatCurrency(ad.cpi)}
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
          <h3 className="text-sm font-semibold text-slate-200 mb-4">📊 PLA Creative Distribution</h3>
          <div className="flex items-center gap-6">
            {/* Horizontal bar */}
            <div className="flex-1">
              <div className="flex h-8 rounded-lg overflow-hidden" style={{ background: '#1e2d4a' }}>
                {winnerPct > 0 && (
                  <div
                    className="flex items-center justify-center text-xs font-bold transition-all"
                    style={{ width: `${winnerPct}%`, background: 'rgba(16,185,129,0.6)', color: '#d1fae5' }}
                  >
                    {winnerPct.toFixed(0)}%
                  </div>
                )}
                {watchingPct > 0 && (
                  <div
                    className="flex items-center justify-center text-xs font-bold transition-all"
                    style={{ width: `${watchingPct}%`, background: 'rgba(245,158,11,0.5)', color: '#fef3c7' }}
                  >
                    {watchingPct.toFixed(0)}%
                  </div>
                )}
                {killPct > 0 && (
                  <div
                    className="flex items-center justify-center text-xs font-bold transition-all"
                    style={{ width: `${killPct}%`, background: 'rgba(239,68,68,0.5)', color: '#fee2e2' }}
                  >
                    {killPct.toFixed(0)}%
                  </div>
                )}
              </div>
            </div>
            {/* Legend */}
            <div className="flex gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded" style={{ background: '#10b981' }} />
                <span style={{ color: '#94a3b8' }}>Winner ({winners})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded" style={{ background: '#f59e0b' }} />
                <span style={{ color: '#94a3b8' }}>Watching ({watching})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded" style={{ background: '#ef4444' }} />
                <span style={{ color: '#94a3b8' }}>Kill ({kills})</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

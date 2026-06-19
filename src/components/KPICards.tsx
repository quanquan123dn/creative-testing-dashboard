'use client';

import { EnrichedAd } from '@/app/page';
import { DecisionConfig } from '@/lib/decision-engine';

interface KPICardsProps {
  ads: EnrichedAd[];
  loading: boolean;
  config: DecisionConfig;
}

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

export default function KPICards({ ads, loading, config }: KPICardsProps) {
  const totalSpend = ads.reduce((s, a) => s + a.spend, 0);
  const totalImpressions = ads.reduce((s, a) => s + a.impressions, 0);
  const totalInstalls = ads.reduce((s, a) => s + a.installs, 0);
  const totalClicks = ads.reduce((s, a) => s + a.clicks, 0);

  const avgIPM = totalImpressions > 0 ? (totalInstalls / totalImpressions) * 1000 : 0;
  const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const avgCPI = totalInstalls > 0 ? totalSpend / totalInstalls : 0;
  const avgC2I = totalClicks > 0 ? (totalInstalls / totalClicks) * 100 : 0;

  const winners = ads.filter((a) => a.decision_result.decision === 'winner').length;
  const watching = ads.filter((a) => a.decision_result.decision === 'watching').length;
  const kills = ads.filter((a) => a.decision_result.decision === 'kill').length;
  const newAds = ads.filter((a) => a.decision_result.decision === 'new').length;

  const ipmColor = avgIPM >= config.ipm_winner ? '#10b981' : avgIPM >= config.ipm_watching ? '#f59e0b' : '#ef4444';

  const cards = [
    {
      id: 'kpi-spend',
      label: 'Total Spend',
      value: loading ? null : formatCurrency(totalSpend),
      sub: loading ? null : `${ads.filter(a => a.status === 'ACTIVE').length} active ads`,
      icon: '💸',
      color: '#3b82f6',
    },
    {
      id: 'kpi-ipm',
      label: 'Avg IPM',
      value: loading ? null : formatNumber(avgIPM),
      sub: loading ? null : `Benchmark: ${config.ipm_winner}`,
      icon: '📲',
      color: ipmColor,
      highlight: true,
    },
    {
      id: 'kpi-ctr',
      label: 'Avg CTR',
      value: loading ? null : `${avgCTR.toFixed(2)}%`,
      sub: loading ? null : `${formatNumber(totalClicks, 0)} clicks`,
      icon: '👆',
      color: '#8b5cf6',
    },
    {
      id: 'kpi-c2i',
      label: 'Avg Click-to-Install',
      value: loading ? null : `${avgC2I.toFixed(1)}%`,
      sub: loading ? null : `${formatNumber(totalInstalls, 0)} installs`,
      icon: '📦',
      color: '#06b6d4',
    },
    {
      id: 'kpi-cpi',
      label: 'Avg CPI',
      value: loading ? null : formatCurrency(avgCPI),
      sub: loading ? null : formatNumber(totalImpressions, 0) + ' impressions',
      icon: '🎯',
      color: '#f59e0b',
    },
    {
      id: 'kpi-decisions',
      label: 'Decisions',
      value: loading ? null : `${winners}🏆 ${watching}⏳ ${kills}❌`,
      sub: loading ? null : `${newAds} chưa đủ 10K impr`,
      icon: '🏆',
      color: '#10b981',
      isDecision: true,
      winners,
      watching,
      kills,
      newAds,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 fade-in-up">
      {cards.map((card) => (
        <div
          key={card.id}
          id={card.id}
          className="glass-card p-4 fade-in-up"
          style={{
            borderLeft: `2px solid ${card.color}30`,
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-base">{card.icon}</span>
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: card.color, opacity: 0.7 }}
            />
          </div>
          <div className="text-xs mb-1" style={{ color: '#64748b' }}>
            {card.label}
          </div>
          {loading ? (
            <div className="h-6 rounded shimmer" />
          ) : card.isDecision ? (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-sm font-bold" style={{ color: '#10b981' }}>
                {card.winners}🏆
              </span>
              <span className="text-sm font-bold" style={{ color: '#f59e0b' }}>
                {card.watching}⏳
              </span>
              <span className="text-sm font-bold" style={{ color: '#ef4444' }}>
                {card.kills}❌
              </span>
            </div>
          ) : (
            <div
              className="text-lg font-bold"
              style={{ color: card.highlight ? ipmColor : card.color }}
            >
              {card.value}
            </div>
          )}
          {!loading && card.sub && (
            <div className="text-[11px] mt-1" style={{ color: '#94a3b8' }}>
              {card.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

'use client';

import { EnrichedAd } from '@/app/page';
import { DecisionConfig, getIPMBarColor } from '@/lib/decision-engine';
import { X, Trophy, Clock, XCircle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import Image from 'next/image';

interface CompareModalProps {
  ads: EnrichedAd[];
  config: DecisionConfig;
  onClose: () => void;
}

interface MetricRow {
  label: string;
  key: string;
  format: (v: number) => string;
  higherIsBetter: boolean;
  highlight?: boolean;
}

const METRICS: MetricRow[] = [
  { label: 'IPM', key: 'ipm', format: v => v.toFixed(2), higherIsBetter: true, highlight: true },
  { label: 'Spend', key: 'spend', format: v => `$${v.toFixed(2)}`, higherIsBetter: false },
  { label: 'Impressions', key: 'impressions', format: v => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toString(), higherIsBetter: true },
  { label: 'Installs', key: 'installs', format: v => v.toLocaleString(), higherIsBetter: true },
  { label: 'CTR', key: 'ctr', format: v => `${v.toFixed(2)}%`, higherIsBetter: true },
  { label: 'CVR', key: 'click_to_install', format: v => `${v.toFixed(1)}%`, higherIsBetter: true },
  { label: 'CPM', key: 'cpm', format: v => `$${v.toFixed(2)}`, higherIsBetter: false },
  { label: 'CPI', key: 'cpi', format: v => `$${v.toFixed(2)}`, higherIsBetter: false },
  { label: 'Hook Rate', key: 'hook_rate', format: v => `${v.toFixed(1)}%`, higherIsBetter: true },
  { label: 'Hold Rate', key: 'hold_rate', format: v => `${v.toFixed(1)}%`, higherIsBetter: true },
];

function DiffIndicator({ a, b, higherIsBetter }: { a: number; b: number; higherIsBetter: boolean }) {
  if (a === 0 || b === 0 || a === b) return <Minus size={14} style={{ color: '#64748b' }} />;
  const better = higherIsBetter ? a > b : a < b;
  return better
    ? <TrendingUp size={14} style={{ color: '#10b981' }} />
    : <TrendingDown size={14} style={{ color: '#ef4444' }} />;
}

function getDiffPct(a: number, b: number): string {
  if (b === 0) return '—';
  const pct = ((a - b) / b) * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

export default function CompareModal({ ads, config, onClose }: CompareModalProps) {
  const [adA, adB] = ads;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl mx-4 rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, #0f1629, #131b33)',
          border: '1px solid rgba(139,92,246,0.2)',
          boxShadow: '0 25px 80px rgba(0,0,0,0.5), 0 0 60px rgba(139,92,246,0.1)',
          maxHeight: '85vh',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-3">
            <span className="text-lg">⚡</span>
            <h2 className="text-base font-bold" style={{ color: '#e2e8f0' }}>Creative Comparison</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 transition-all" style={{ color: '#64748b' }}>
            <X size={18} />
          </button>
        </div>

        {/* Creative Headers */}
        <div className="grid grid-cols-[1fr_100px_1fr] px-6 py-4 gap-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {[adA, adB].map((ad, i) => (
            <div key={ad.ad_id} className="flex items-center gap-3">
              <div style={{
                width: 48, height: 48, minWidth: 48, borderRadius: 8, overflow: 'hidden',
                border: `2px solid ${i === 0 ? 'rgba(59,130,246,0.5)' : 'rgba(168,85,247,0.5)'}`,
              }}>
                {ad.thumbnail_url ? (
                  <Image src={ad.thumbnail_url} alt={ad.ad_name} width={48} height={48} unoptimized className="object-cover w-full h-full" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-lg" style={{ background: '#1e2d4a' }}>🎬</div>
                )}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate" style={{ color: i === 0 ? '#60a5fa' : '#c084fc' }}>
                  {ad.ad_name.replace(/^TSH\d+_/, '')}
                </div>
                <DecisionBadgeSmall result={ad.decision_result} />
              </div>
            </div>
          )).reduce<React.ReactNode[]>((acc, el, i) => {
            if (i === 1) acc.push(
              <div key="vs" className="flex items-center justify-center">
                <span className="text-xl font-black" style={{
                  background: 'linear-gradient(135deg, #60a5fa, #c084fc)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                }}>VS</span>
              </div>
            );
            acc.push(el);
            return acc;
          }, [])}
        </div>

        {/* Metrics */}
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(85vh - 200px)' }}>
          {METRICS.map(metric => {
            const valA = (adA as any)[metric.key] as number || 0;
            const valB = (adB as any)[metric.key] as number || 0;
            const aWins = metric.higherIsBetter ? valA > valB : valA < valB;
            const bWins = metric.higherIsBetter ? valB > valA : valB < valA;
            const isTie = valA === valB || (valA === 0 && valB === 0);

            return (
              <div
                key={metric.key}
                className="grid grid-cols-[1fr_100px_1fr] px-6 py-3 gap-4 items-center transition-colors hover:bg-white/[0.02]"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
              >
                {/* Ad A value */}
                <div className="flex items-center justify-end gap-2">
                  <DiffIndicator a={valA} b={valB} higherIsBetter={metric.higherIsBetter} />
                  <span
                    className={`text-sm ${metric.highlight ? 'text-base' : ''} font-bold`}
                    style={{
                      color: isTie ? '#94a3b8' : aWins ? '#10b981' : '#ef4444',
                    }}
                  >
                    {valA > 0 ? metric.format(valA) : '—'}
                  </span>
                  {!isTie && valA > 0 && valB > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{
                      background: aWins ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                      color: aWins ? '#34d399' : '#fca5a5',
                    }}>
                      {getDiffPct(valA, valB)}
                    </span>
                  )}
                </div>

                {/* Metric label */}
                <div className="text-center">
                  <span className={`text-xs font-medium ${metric.highlight ? 'text-sm font-bold' : ''}`} style={{ color: metric.highlight ? '#e2e8f0' : '#64748b' }}>
                    {metric.label}
                  </span>
                  {metric.highlight && metric.key === 'ipm' && (
                    <div className="text-[9px] mt-0.5" style={{ color: '#475569' }}>
                      Pass: ≥{config.ipm_winner}
                    </div>
                  )}
                </div>

                {/* Ad B value */}
                <div className="flex items-center gap-2">
                  {!isTie && valA > 0 && valB > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{
                      background: bWins ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                      color: bWins ? '#34d399' : '#fca5a5',
                    }}>
                      {getDiffPct(valB, valA)}
                    </span>
                  )}
                  <span
                    className={`text-sm ${metric.highlight ? 'text-base' : ''} font-bold`}
                    style={{
                      color: isTie ? '#94a3b8' : bWins ? '#10b981' : '#ef4444',
                    }}
                  >
                    {valB > 0 ? metric.format(valB) : '—'}
                  </span>
                  <DiffIndicator a={valB} b={valA} higherIsBetter={metric.higherIsBetter} />
                </div>
              </div>
            );
          })}

          {/* Summary */}
          <div className="px-6 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="grid grid-cols-[1fr_100px_1fr] gap-4 items-center">
              <div className="text-right">
                <WinCount ads={ads} index={0} />
              </div>
              <div className="text-center text-xs" style={{ color: '#64748b' }}>Metrics Won</div>
              <div>
                <WinCount ads={ads} index={1} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WinCount({ ads, index }: { ads: EnrichedAd[]; index: number }) {
  const other = index === 0 ? 1 : 0;
  let wins = 0;
  METRICS.forEach(m => {
    const v = (ads[index] as any)[m.key] as number || 0;
    const o = (ads[other] as any)[m.key] as number || 0;
    if (v === 0 && o === 0) return;
    if (m.higherIsBetter ? v > o : v < o) wins++;
  });
  return (
    <span className="text-2xl font-black" style={{
      background: wins > METRICS.length / 2 ? 'linear-gradient(135deg, #10b981, #34d399)' : 'linear-gradient(135deg, #64748b, #94a3b8)',
      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
    }}>
      {wins}
    </span>
  );
}

function DecisionBadgeSmall({ result }: { result: EnrichedAd['decision_result'] }) {
  const Icon = result.decision === 'winner' ? Trophy :
               result.decision === 'watching' ? Clock : XCircle;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium mt-0.5"
      style={{ background: result.hexBg, color: result.hexColor, border: `1px solid ${result.hexBorder}` }}>
      <Icon size={10} />
      {result.label}
    </span>
  );
}

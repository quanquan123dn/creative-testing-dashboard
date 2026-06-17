'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from 'recharts';
import { EnrichedAd } from '@/app/page';
import { DecisionConfig, getIPMBarColor } from '@/lib/decision-engine';

interface IPMTrendChartProps {
  ads: EnrichedAd[];
  loading: boolean;
  config: DecisionConfig;
}

function truncate(s: string, n = 16) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

const CustomTooltip = ({ active, payload }: {
  active?: boolean;
  payload?: { name: string; value: number; payload: { fullName: string; spend: number; installs: number; decision: string } }[];
}) => {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="glass-card p-3 text-xs" style={{ minWidth: 180 }}>
      <p className="font-semibold text-slate-200 mb-2" style={{ maxWidth: 180 }}>{d.payload.fullName}</p>
      <p style={{ color: '#60a5fa' }}>IPM: <strong>{d.value.toFixed(3)}</strong></p>
      <p style={{ color: '#94a3b8' }}>Spend: ${d.payload.spend.toFixed(2)}</p>
      <p style={{ color: '#94a3b8' }}>Installs: {d.payload.installs}</p>
      <p style={{ color: '#94a3b8' }}>Decision: {d.payload.decision}</p>
    </div>
  );
};

export default function IPMTrendChart({ ads, loading, config }: IPMTrendChartProps) {
  if (loading) {
    return <div className="h-52 shimmer rounded-lg" />;
  }

  const sorted = [...ads]
    .filter(a => a.installs > 0)
    .sort((a, b) => b.ipm - a.ipm)
    .slice(0, 12);

  if (sorted.length === 0) {
    return (
      <div className="h-52 flex flex-col items-center justify-center gap-2" style={{ color: '#475569' }}>
        <span className="text-3xl">📊</span>
        <span className="text-sm">No install data available yet</span>
        <span className="text-xs">Ads need installs for IPM calculation</span>
      </div>
    );
  }

  const data = sorted.map(a => ({
    name: truncate(a.ad_name),
    fullName: a.ad_name,
    ipm: parseFloat(a.ipm.toFixed(3)),
    spend: a.spend,
    installs: a.installs,
    decision: a.decision_result.label,
  }));

  // Benchmark lines
  const maxIPM = Math.max(...data.map(d => d.ipm), config.ipm_winner * 1.3);

  return (
    <div className="space-y-3">
      {/* Legend */}
      <div className="flex items-center gap-4 text-xs flex-wrap" style={{ color: '#64748b' }}>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-1 rounded" style={{ background: '#10b981' }} />
          <span>Winner (IPM ≥ {config.ipm_winner})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-1 rounded" style={{ background: '#f59e0b' }} />
          <span>Watching ({config.ipm_watching}–{config.ipm_winner})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-1 rounded" style={{ background: '#ef4444' }} />
          <span>Kill (below {config.ipm_watching})</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2d4a" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fill: '#64748b', fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: '#1e2d4a' }}
            angle={-35}
            textAnchor="end"
            interval={0}
          />
          <YAxis
            domain={[0, maxIPM]}
            tick={{ fill: '#64748b', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => v.toFixed(1)}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          <Bar dataKey="ipm" radius={[4, 4, 0, 0]} maxBarSize={32}>
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={getIPMBarColor(entry.ipm, config)}
                fillOpacity={0.8}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Benchmark indicators */}
      <div className="flex gap-4 text-xs justify-center" style={{ color: '#64748b' }}>
        <span>🟢 Target IPM: <strong style={{ color: '#10b981' }}>{config.ipm_winner}</strong></span>
        <span>🟡 Minimum: <strong style={{ color: '#f59e0b' }}>{config.ipm_watching}</strong></span>
      </div>
    </div>
  );
}

'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { EnrichedAd } from '@/app/page';

interface CreativeDistributionChartProps {
  ads: EnrichedAd[];
  loading: boolean;
}

const CATEGORY_META = {
  winner: { label: 'Pass 🏆', color: '#10b981', hoverColor: '#34d399' },
  watching: { label: 'Iterate ⏳', color: '#f59e0b', hoverColor: '#fbbf24' },
  kill: { label: 'Fail ❌', color: '#ef4444', hoverColor: '#f87171' },
  new: { label: 'New / Collecting Data 🔵', color: '#3b82f6', hoverColor: '#60a5fa' },
};

const CustomTooltip = ({ active, payload }: {
  active?: boolean;
  payload?: { name: string; value: number; payload: { pct: string; color: string } }[];
}) => {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="glass-card p-3 text-xs" style={{ minWidth: 160 }}>
      <p className="font-semibold text-slate-200 mb-1">{d.name}</p>
      <p style={{ color: d.payload.color }}>
        <strong>{d.value}</strong> ad{d.value !== 1 ? 's' : ''} ({d.payload.pct}%)
      </p>
    </div>
  );
};

export default function CreativeDistributionChart({ ads, loading }: CreativeDistributionChartProps) {
  if (loading) {
    return <div className="h-52 shimmer rounded-lg w-full" />;
  }

  const counts = { winner: 0, watching: 0, kill: 0, new: 0 };
  ads.forEach((ad) => {
    const decision = ad.decision_result.decision;
    if (counts[decision] !== undefined) {
      counts[decision]++;
    }
  });

  const total = ads.length;
  if (total === 0) {
    return (
      <div className="h-52 flex flex-col items-center justify-center gap-2" style={{ color: '#475569' }}>
        <span className="text-3xl">📊</span>
        <span className="text-sm">No ads data available</span>
      </div>
    );
  }

  const data = (['winner', 'watching', 'kill', 'new'] as const)
    .map((key) => {
      const meta = CATEGORY_META[key];
      const count = counts[key];
      const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
      return {
        name: meta.label,
        value: count,
        pct,
        color: meta.color,
        hoverColor: meta.hoverColor,
      };
    })
    .filter((d) => d.value > 0); // only show categories with at least 1 ad

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 items-center gap-6">
      {/* Donut Chart */}
      <div className="h-52 w-full relative flex items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={3}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.color}
                  fillOpacity={0.8}
                  stroke="#0f172a"
                  strokeWidth={2}
                  style={{
                    outline: 'none',
                    filter: `drop-shadow(0 0 4px ${entry.color}20)`,
                    transition: 'all 0.2s ease',
                    cursor: 'pointer'
                  }}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        {/* Center count label */}
        <div className="absolute flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-bold text-slate-100">{total}</span>
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Total Ads</span>
        </div>
      </div>

      {/* Modern Legend */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Breakdown</h4>
        <div className="grid grid-cols-1 gap-2.5">
          {data.map((entry, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-2.5 rounded-lg border transition-all hover:bg-slate-800/10"
              style={{
                background: 'rgba(30, 41, 59, 0.2)',
                borderColor: `${entry.color}20`,
              }}
            >
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: entry.color }} />
                <span className="text-xs font-medium text-slate-300">{entry.name}</span>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-slate-100">{entry.value} ad{entry.value !== 1 ? 's' : ''}</span>
                <span className="text-[10px] text-slate-400 ml-2">({entry.pct}%)</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

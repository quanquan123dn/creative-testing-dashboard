'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { EnrichedAd } from '@/app/page';

interface SpendDonutProps {
  ads: EnrichedAd[];
  loading: boolean;
}

const COLORS = [
  '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
];

function truncate(s: string, n = 18) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

const CustomTooltip = ({ active, payload }: {
  active?: boolean;
  payload?: { name: string; value: number; payload: { pct: string } }[];
}) => {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="glass-card p-3 text-xs" style={{ minWidth: 150 }}>
      <p className="font-semibold text-slate-200 mb-1">{d.name}</p>
      <p style={{ color: '#60a5fa' }}>${d.value.toFixed(2)} ({d.payload.pct}%)</p>
    </div>
  );
};

export default function SpendDonut({ ads, loading }: SpendDonutProps) {
  if (loading) {
    return <div className="h-52 shimmer rounded-full mx-auto" style={{ width: 200, height: 200, borderRadius: '50%' }} />;
  }

  const withSpend = ads.filter(a => a.spend > 0).sort((a, b) => b.spend - a.spend);
  const totalSpend = withSpend.reduce((s, a) => s + a.spend, 0);

  if (withSpend.length === 0 || totalSpend === 0) {
    return (
      <div className="h-52 flex flex-col items-center justify-center gap-2" style={{ color: '#475569' }}>
        <span className="text-3xl">💸</span>
        <span className="text-sm">No spend data</span>
      </div>
    );
  }

  // Top 8 + "Others"
  const top = withSpend.slice(0, 8);
  const others = withSpend.slice(8);
  const othersSpend = others.reduce((s, a) => s + a.spend, 0);

  const data = [
    ...top.map(a => ({
      name: truncate(a.ad_name),
      value: parseFloat(a.spend.toFixed(2)),
      pct: ((a.spend / totalSpend) * 100).toFixed(1),
      decision: a.decision_result.decision,
    })),
    ...(othersSpend > 0 ? [{
      name: `Others (${others.length})`,
      value: parseFloat(othersSpend.toFixed(2)),
      pct: ((othersSpend / totalSpend) * 100).toFixed(1),
      decision: 'new',
    }] : []),
  ];

  return (
    <div className="space-y-3">
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={COLORS[index % COLORS.length]}
                fillOpacity={0.85}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
        {data.map((entry, index) => (
          <div key={index} className="flex items-center justify-between text-xs gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <div
                className="w-2 h-2 rounded-sm flex-shrink-0"
                style={{ background: COLORS[index % COLORS.length] }}
              />
              <span className="truncate" style={{ color: '#94a3b8' }}>{entry.name}</span>
            </div>
            <span className="flex-shrink-0 font-medium" style={{ color: '#e2e8f0' }}>
              {entry.pct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

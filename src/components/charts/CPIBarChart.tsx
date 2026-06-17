'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell
} from 'recharts';
import { EnrichedAd } from '@/app/page';
import { DecisionConfig, getIPMBarColor } from '@/lib/decision-engine';

interface CPIBarChartProps {
  ads: EnrichedAd[];
  loading: boolean;
  config: DecisionConfig;
}

function truncate(s: string, n = 18) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { payload: { name: string; ipm: number; spend: number; installs: number } }[] }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="glass-card p-3 text-xs" style={{ minWidth: 160 }}>
      <p className="font-semibold text-slate-200 mb-2 truncate" style={{ maxWidth: 160 }}>{d.name}</p>
      <p style={{ color: '#60a5fa' }}>IPM: <strong>{d.ipm.toFixed(2)}</strong></p>
      <p style={{ color: '#94a3b8' }}>Spend: ${d.spend.toFixed(2)}</p>
      <p style={{ color: '#94a3b8' }}>Installs: {d.installs}</p>
    </div>
  );
};

export default function CPIBarChart({ ads, loading, config }: CPIBarChartProps) {
  if (loading) {
    return <div className="h-48 shimmer rounded-lg" />;
  }

  const data = ads
    .filter(a => a.ipm > 0)
    .sort((a, b) => b.ipm - a.ipm)
    .slice(0, 15)
    .map((a) => ({
      name: truncate(a.ad_name),
      fullName: a.ad_name,
      ipm: parseFloat(a.ipm.toFixed(3)),
      spend: a.spend,
      installs: a.installs,
      decision: a.decision_result.decision,
    }));

  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-sm" style={{ color: '#475569' }}>
        No IPM data available yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(data.length * 36, 200)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 60, left: 140, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#1e2d4a" horizontal={false} />
        <XAxis
          type="number"
          domain={[0, Math.max(...data.map(d => d.ipm)) * 1.2]}
          tick={{ fill: '#64748b', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: '#1e2d4a' }}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fill: '#94a3b8', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={130}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
        <ReferenceLine
          x={config.ipm_winner}
          stroke="#10b981"
          strokeDasharray="4 2"
          label={{ value: `Target: ${config.ipm_winner}`, fill: '#10b981', fontSize: 10, position: 'right' }}
        />
        <ReferenceLine
          x={config.ipm_watching}
          stroke="#f59e0b"
          strokeDasharray="4 2"
          label={{ value: `Min: ${config.ipm_watching}`, fill: '#f59e0b', fontSize: 10, position: 'right' }}
        />
        <Bar dataKey="ipm" radius={[0, 4, 4, 0]} maxBarSize={20}>
          {data.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={getIPMBarColor(entry.ipm, config)}
              fillOpacity={0.85}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

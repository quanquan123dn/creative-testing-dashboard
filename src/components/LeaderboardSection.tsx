'use client';

interface LeaderboardItem {
  name: string;
  value: number;
  id: string;
}

interface LeaderboardProps {
  title: string;
  icon: string;
  items: LeaderboardItem[];
  formatValue: (v: number) => string;
  accentColor: string;
  benchmarkValue?: number;
  benchmarkLabel?: string;
}

function Leaderboard({ title, icon, items, formatValue, accentColor, benchmarkValue, benchmarkLabel }: LeaderboardProps) {
  const top5 = items.slice(0, 5);
  const maxVal = top5.length > 0 ? Math.max(...top5.map(i => i.value)) : 1;

  const getMedalEmoji = (rank: number) => {
    if (rank === 0) return '🥇';
    if (rank === 1) return '🥈';
    if (rank === 2) return '🥉';
    return `#${rank + 1}`;
  };

  return (
    <div className="glass-card p-4" style={{ minWidth: 0 }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">{icon}</span>
        <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">{title}</h4>
      </div>
      {benchmarkValue !== undefined && benchmarkLabel && (
        <div className="text-[10px] mb-3 px-2 py-1 rounded inline-block" style={{
          background: 'rgba(100,116,139,0.1)',
          color: '#64748b',
          border: '1px solid rgba(100,116,139,0.2)',
        }}>
          Benchmark: {benchmarkLabel}
        </div>
      )}
      <div className="space-y-2">
        {top5.map((item, idx) => {
          const pct = maxVal > 0 ? (item.value / maxVal) * 100 : 0;
          const isAboveBenchmark = benchmarkValue !== undefined ? item.value >= benchmarkValue : true;
          return (
            <div key={item.id} className="group">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs w-6 text-center flex-shrink-0" style={{
                    color: idx < 3 ? '#e2e8f0' : '#64748b',
                    fontWeight: idx < 3 ? 700 : 400,
                  }}>
                    {getMedalEmoji(idx)}
                  </span>
                  <span className="text-xs truncate" style={{ color: '#cbd5e1', maxWidth: '120px' }} title={item.name}>
                    {item.name}
                  </span>
                </div>
                <span className="text-xs font-bold flex-shrink-0 ml-2" style={{
                  color: isAboveBenchmark ? accentColor : '#f87171',
                }}>
                  {formatValue(item.value)}
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#1e2d4a' }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${accentColor}80, ${accentColor})`,
                  }}
                />
              </div>
            </div>
          );
        })}
        {top5.length === 0 && (
          <div className="text-xs text-center py-4" style={{ color: '#475569' }}>
            No data
          </div>
        )}
      </div>
    </div>
  );
}

export interface LeaderboardData {
  name: string;
  id: string;
  ipm: number;
  ctr: number;
  cvr: number;  // click_to_install or cvr
}

interface LeaderboardSectionProps {
  data: LeaderboardData[];
  loading: boolean;
  ipmBenchmark?: number;
}

export default function LeaderboardSection({ data, loading, ipmBenchmark }: LeaderboardSectionProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 fade-in-up">
        {[1, 2, 3].map(i => (
          <div key={i} className="glass-card p-4">
            <div className="h-4 w-24 shimmer rounded mb-3" />
            {[1, 2, 3, 4, 5].map(j => (
              <div key={j} className="mb-2">
                <div className="h-3 shimmer rounded mb-1" />
                <div className="h-1.5 shimmer rounded" />
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  const sortedByIPM = [...data].sort((a, b) => b.ipm - a.ipm).map(d => ({
    name: d.name, id: d.id, value: d.ipm,
  }));

  const sortedByCTR = [...data].sort((a, b) => b.ctr - a.ctr).map(d => ({
    name: d.name, id: d.id, value: d.ctr,
  }));

  const sortedByCVR = [...data].sort((a, b) => b.cvr - a.cvr).map(d => ({
    name: d.name, id: d.id, value: d.cvr,
  }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 fade-in-up">
      <Leaderboard
        title="Top IPM"
        icon="📲"
        items={sortedByIPM}
        formatValue={(v) => v.toFixed(2)}
        accentColor="#10b981"
        benchmarkValue={ipmBenchmark}
        benchmarkLabel={ipmBenchmark ? `≥ ${ipmBenchmark}` : undefined}
      />
      <Leaderboard
        title="Top CTR"
        icon="👆"
        items={sortedByCTR}
        formatValue={(v) => `${v.toFixed(2)}%`}
        accentColor="#8b5cf6"
      />
      <Leaderboard
        title="Top CVR"
        icon="📦"
        items={sortedByCVR}
        formatValue={(v) => `${v.toFixed(1)}%`}
        accentColor="#06b6d4"
      />
    </div>
  );
}

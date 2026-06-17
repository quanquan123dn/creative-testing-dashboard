'use client';

import { EnrichedAd } from '@/app/page';
import { DecisionConfig } from '@/lib/decision-engine';
import KPICards from '@/components/KPICards';
import CreativeTable from '@/components/CreativeTable';
import CreativeDistributionChart from '@/components/charts/CreativeDistributionChart';

interface VideoTabProps {
  ads: EnrichedAd[];
  loading: boolean;
  config: DecisionConfig;
  datePreset: string;
}

export default function VideoTab({ ads, loading, config, datePreset }: VideoTabProps) {
  return (
    <div className="space-y-5 fade-in-up">
      {/* KPI Cards */}
      <KPICards ads={ads} loading={loading} config={config} />

      {/* Main Table */}
      <div className="glass-card">
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: '#1e2d4a' }}>
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-slate-200">🎬 Video Creative Performance</h2>
            {!loading && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{
                background: 'rgba(59,130,246,0.1)',
                border: '1px solid rgba(59,130,246,0.2)',
                color: '#60a5fa'
              }}>
                {ads.length} ads
              </span>
            )}
          </div>
          <div className="text-xs" style={{ color: '#64748b' }}>
            {datePreset === 'last_7d' ? 'Last 7 days' :
             datePreset === 'last_14d' ? 'Last 14 days' :
             datePreset === 'last_30d' ? 'Last 30 days' :
             datePreset === 'today' ? 'Today' :
             datePreset === 'yesterday' ? 'Yesterday' :
             datePreset === 'maximum' ? 'Maximum timeframe' : datePreset}
          </div>
        </div>
        <CreativeTable ads={ads} loading={loading} config={config} />
      </div>

      {/* Creative Distribution Chart */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold text-slate-200 mb-4">📊 Creative Type Distribution</h3>
        <CreativeDistributionChart ads={ads} loading={loading} />
      </div>
    </div>
  );
}

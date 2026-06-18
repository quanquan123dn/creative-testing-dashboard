'use client';

import { RefreshCw, Zap, Activity } from 'lucide-react';

interface HeaderProps {
  campaignName: string | null;
  lastSync: string | null;
  loading: boolean;
  datePreset: string;
  onDatePresetChange: (preset: string) => void;
  onSync: (force?: boolean) => void;
}

const DATE_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7d', label: '7 Days' },
  { value: 'last_14d', label: '14 Days' },
  { value: 'last_30d', label: '30 Days' },
  { value: 'maximum', label: 'Maximum' },
];

function formatLastSync(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function Header({
  campaignName,
  lastSync,
  loading,
  datePreset,
  onDatePresetChange,
  onSync,
}: HeaderProps) {
  return (
    <header style={{ background: '#0f1629', borderBottom: '1px solid #1e2d4a' }}>
      <div className="max-w-[1600px] mx-auto px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Left: Logo + Campaign */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{
                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)'
              }}>
                <Zap size={16} className="text-white" />
              </div>
              <div>
                <h1 className="text-sm font-bold gradient-text leading-none">
                  Creative Testing
                </h1>
                <p className="text-[10px] mt-0.5" style={{ color: '#64748b' }}>
                  Meta Ads Dashboard
                </p>
              </div>
            </div>

            {campaignName && (
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{
                background: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.2)'
              }}>
                <Activity size={12} className="text-blue-400" />
                <span className="text-xs font-mono" style={{ color: '#94a3b8', maxWidth: '300px' }}>
                  {campaignName.length > 45 ? campaignName.slice(0, 45) + '…' : campaignName}
                </span>
              </div>
            )}
          </div>

          {/* Right: controls */}
          <div className="flex items-center gap-3">
            {/* Sync status */}
            <div className="hidden sm:flex items-center gap-2 text-xs" style={{ color: '#64748b' }}>
              <span
                className="w-2 h-2 rounded-full pulse-dot"
                style={{ background: loading ? '#f59e0b' : '#10b981' }}
              />
              <span>
                {loading ? 'Syncing…' : `Last sync: ${formatLastSync(lastSync)}`}
              </span>
            </div>

            {/* Date preset picker */}
            <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid #1e2d4a' }}>
              {DATE_PRESETS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => onDatePresetChange(p.value)}
                  className="px-3 py-1.5 text-xs font-medium transition-all duration-150"
                  style={{
                    background: datePreset === p.value
                      ? 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(139,92,246,0.2))'
                      : 'transparent',
                    color: datePreset === p.value ? '#e2e8f0' : '#64748b',
                    borderRight: '1px solid #1e2d4a',
                  }}
                  id={`date-preset-${p.value}`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Sync button */}
            <button
              onClick={() => onSync(true)}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
              style={{
                background: 'rgba(59, 130, 246, 0.15)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                color: '#60a5fa',
              }}
              id="btn-sync"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Sync
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

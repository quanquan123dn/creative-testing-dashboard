'use client';

import { RefreshCw, Activity } from 'lucide-react';
import Image from 'next/image';

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
    <header className="sticky top-0 z-20 backdrop-blur-xl" style={{ background: 'rgba(15,22,41,0.85)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="max-w-[1600px] mx-auto px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Left: Logo + Campaign */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center bg-black/40">
                <Image src="/logo.png" alt="Logo" width={32} height={32} className="object-cover w-full h-full" />
              </div>
              <div>
                <h1 className="text-sm font-bold gradient-text leading-none">
                  Creative Testing
                </h1>
                <p className="text-[10px] mt-0.5" style={{ color: '#64748b' }}>
                  Dashboard
                </p>
              </div>
            </div>


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
            <div className="flex items-center p-1 rounded-lg" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
              {DATE_PRESETS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => onDatePresetChange(p.value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${datePreset === p.value ? 'shadow-sm' : 'hover:bg-white/5'}`}
                  style={{
                    background: datePreset === p.value
                      ? 'linear-gradient(135deg, rgba(59,130,246,0.3), rgba(139,92,246,0.3))'
                      : 'transparent',
                    color: datePreset === p.value ? '#fff' : '#94a3b8',
                  }}
                  id={`date-preset-${p.value}`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Sync button */}
            <button
              id="btn-sync"
              onClick={() => onSync(true)}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 shadow-sm"
              style={{
                background: loading ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.15)',
                color: loading ? '#64748b' : '#60a5fa',
                border: '1px solid rgba(59, 130, 246, 0.3)',
              }}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Syncing...' : 'Sync'}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

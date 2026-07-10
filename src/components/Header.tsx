'use client';

import { useState, useRef, useEffect } from 'react';
import { RefreshCw, ChevronDown } from 'lucide-react';
import Image from 'next/image';
import { GameConfig } from '@/lib/game-config';

interface HeaderProps {
  campaignName: string | null;
  lastSync: string | null;
  loading: boolean;
  datePreset: string;
  onDatePresetChange: (preset: string) => void;
  onSync: (force?: boolean) => void;
  gameConfig: GameConfig;
  gameList: GameConfig[];
  onGameChange: (gameId: string) => void;
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
  lastSync,
  loading,
  datePreset,
  onDatePresetChange,
  onSync,
  gameConfig,
  gameList,
  onGameChange,
}: HeaderProps) {
  const [gameDropdownOpen, setGameDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setGameDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <header style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="max-w-[1600px] mx-auto px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Left: Logo + Game Selector */}
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

            {/* Game Selector */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setGameDropdownOpen(!gameDropdownOpen)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all hover:scale-[1.02]"
                style={{
                  background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.15))',
                  border: '1px solid rgba(139,92,246,0.3)',
                  color: '#e2e8f0',
                }}
              >
                <span className="text-base">{gameConfig.icon}</span>
                <span>{gameConfig.name}</span>
                <ChevronDown size={14} className={`transition-transform ${gameDropdownOpen ? 'rotate-180' : ''}`} style={{ color: '#94a3b8' }} />
              </button>

              {gameDropdownOpen && (
                <div className="absolute top-full left-0 mt-2 w-56 rounded-xl overflow-hidden shadow-2xl z-50"
                  style={{ background: '#1a2138', border: '1px solid rgba(255,255,255,0.1)' }}>
                  {gameList.map(game => (
                    <button
                      key={game.id}
                      onClick={() => { onGameChange(game.id); setGameDropdownOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm transition-all hover:bg-white/5 text-left"
                      style={{
                        color: game.id === gameConfig.id ? '#60a5fa' : '#94a3b8',
                        background: game.id === gameConfig.id ? 'rgba(59,130,246,0.08)' : 'transparent',
                      }}
                    >
                      <span className="text-lg">{game.icon}</span>
                      <div>
                        <div className="font-medium" style={{ color: game.id === gameConfig.id ? '#e2e8f0' : '#94a3b8' }}>
                          {game.name}
                        </div>
                        <div className="text-[10px]" style={{ color: '#64748b' }}>
                          {game.shortName} • {Object.values(game.layers).filter(Boolean).length} layers
                        </div>
                      </div>
                      {game.id === gameConfig.id && (
                        <span className="ml-auto text-xs" style={{ color: '#60a5fa' }}>✓</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
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

'use client';

import { useState, useMemo } from 'react';
import { EnrichedAd } from '@/app/page';
import { DecisionConfig, getIPMBarColor } from '@/lib/decision-engine';
import { ChevronUp, ChevronDown, Play, AlertTriangle, Trophy, Clock, XCircle, Circle } from 'lucide-react';
import Image from 'next/image';

interface CreativeTableProps {
  ads: EnrichedAd[];
  loading: boolean;
  config: DecisionConfig;
}

type SortKey = 'ad_name' | 'spend' | 'ipm' | 'ctr' | 'cpm' | 'cpi' | 'click_to_install' | 'hook_rate' | 'installs' | 'impressions';
type SortDir = 'asc' | 'desc';
type FilterDecision = 'all' | 'winner' | 'watching' | 'kill' | 'new';

function fmt(n: number, dec = 2) {
  if (n === 0) return '—';
  return n.toFixed(dec);
}

function fmtCurr(n: number) {
  if (n === 0) return '—';
  return `$${n.toFixed(2)}`;
}

function fmtK(n: number) {
  if (n === 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}



function DecisionBadge({ result }: { result: EnrichedAd['decision_result'] }) {
  const Icon = result.decision === 'winner' ? Trophy :
               result.decision === 'watching' ? Clock :
               result.decision === 'kill' ? XCircle : Circle;

  return (
    <div className="flex flex-col gap-1">
      <span
        className="badge px-2.5 py-1"
        style={{
          background: result.hexBg,
          color: result.hexColor,
          borderColor: result.hexBorder,
        }}
      >
        <Icon size={12} /> {result.label}
      </span>
      {result.warnings.length > 0 && (
        <div className="flex items-center gap-1" title={result.warnings.join(' | ')} style={{ color: '#f59e0b', cursor: 'help' }}>
          <AlertTriangle size={10} />
          <span style={{ fontSize: '10px' }}>{result.warnings.length} warning{result.warnings.length > 1 ? 's' : ''}</span>
        </div>
      )}
    </div>
  );
}

function IPMCell({ ipm, config, maxIPM }: { ipm: number; config: DecisionConfig; maxIPM: number }) {
  const color = getIPMBarColor(ipm, config);
  const pct = Math.min((ipm / Math.max(maxIPM, config.ipm_winner * 1.5)) * 100, 100);

  return (
    <div className="flex flex-col items-end gap-1">
      <span className="text-sm font-bold" style={{ color }}>
        {ipm > 0 ? ipm.toFixed(2) : '—'}
      </span>
      {ipm > 0 && (
        <div className="ipm-bar-track">
          <div className="ipm-bar-fill" style={{ width: `${pct}%`, background: `linear-gradient(90deg, transparent, ${color})` }} />
        </div>
      )}
    </div>
  );
}

function SortIcon({ column, sortKey, sortDir }: { column: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (column !== sortKey) return <span className="ml-1 opacity-20">↕</span>;
  return sortDir === 'desc'
    ? <ChevronDown size={12} className="inline ml-1" />
    : <ChevronUp size={12} className="inline ml-1" />;
}

const SKELETON_ROWS = 6;

export default function CreativeTable({ ads, loading, config }: CreativeTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('ipm');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterDecision, setFilterDecision] = useState<FilterDecision>('all');
  const [filterStatus] = useState<string>('all');

  const maxIPM = useMemo(() => Math.max(...ads.map(a => a.ipm), config.ipm_winner * 1.5), [ads, config.ipm_winner]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const filtered = useMemo(() => {
    let result = [...ads];
    if (filterDecision !== 'all') {
      result = result.filter((a) => a.decision_result.decision === filterDecision);
    }
    if (filterStatus !== 'all') {
      result = result.filter((a) => a.status === filterStatus);
    }
    result.sort((a, b) => {
      if (sortKey === 'ad_name') {
        const aName = a.ad_name.toLowerCase();
        const bName = b.ad_name.toLowerCase();
        return sortDir === 'desc' ? bName.localeCompare(aName) : aName.localeCompare(bName);
      }
      const aVal = (a as any)[sortKey] as number;
      const bVal = (b as any)[sortKey] as number;
      return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
    });
    return result;
  }, [ads, sortKey, sortDir, filterDecision, filterStatus]);

  const filterCounts = useMemo(() => {
    const counts = { all: 0, winner: 0, watching: 0, kill: 0, new: 0 };
    ads.forEach((ad) => {
      if (filterStatus === 'all' || ad.status === filterStatus) {
        counts.all++;
        const dec = ad.decision_result.decision as keyof typeof counts;
        if (counts[dec] !== undefined) {
          counts[dec]++;
        }
      }
    });
    return counts;
  }, [ads, filterStatus]);

  const thStyle = (key: SortKey) => ({
    cursor: 'pointer',
    color: sortKey === key ? '#e2e8f0' : undefined,
  });

  return (
    <div>
      {/* Filters */}
      <div className="px-5 py-3 flex items-center gap-3 flex-wrap" style={{ borderBottom: '1px solid #1e2d4a' }}>
        <span className="text-xs" style={{ color: '#64748b' }}>Filter:</span>
        <div className="flex gap-1">
          {(['all', 'winner', 'watching', 'kill', 'new'] as FilterDecision[]).map((d) => {
            const labels: Record<FilterDecision, React.ReactNode> = {
              all: `All (${filterCounts.all})`,
              winner: <span className="flex items-center gap-1"><Trophy size={12} /> Pass ({filterCounts.winner})</span>,
              watching: <span className="flex items-center gap-1"><Clock size={12} /> Iterate ({filterCounts.watching})</span>,
              kill: <span className="flex items-center gap-1"><XCircle size={12} /> Fail ({filterCounts.kill})</span>,
              new: <span className="flex items-center gap-1"><Circle size={12} fill="currentColor" /> New ({filterCounts.new})</span>
            };
            const active = filterDecision === d;
            return (
              <button
                key={d}
                onClick={() => setFilterDecision(d)}
                className="px-2.5 py-1 rounded text-xs font-medium transition-all"
                style={{
                  background: active ? 'rgba(59,130,246,0.15)' : 'transparent',
                  border: `1px solid ${active ? 'rgba(59,130,246,0.4)' : '#1e2d4a'}`,
                  color: active ? '#60a5fa' : '#64748b',
                }}
                id={`filter-decision-${d}`}
              >
                {labels[d]}
              </button>
            );
          })}
        </div>


      </div>

      {/* Table */}
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ minWidth: 220, ...thStyle('ad_name'), cursor: 'pointer' }} onClick={() => handleSort('ad_name')}>
                Creative <SortIcon column="ad_name" sortKey={sortKey} sortDir={sortDir} />
              </th>

              <th style={thStyle('spend')} onClick={() => handleSort('spend')}>
                Spend <SortIcon column="spend" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th style={thStyle('impressions')} onClick={() => handleSort('impressions')}>
                Impr <SortIcon column="impressions" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th style={thStyle('installs')} onClick={() => handleSort('installs')}>
                Installs <SortIcon column="installs" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th style={thStyle('ipm')} onClick={() => handleSort('ipm')}>
                IPM <SortIcon column="ipm" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th style={thStyle('ctr')} onClick={() => handleSort('ctr')}>
                CTR% <SortIcon column="ctr" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th style={thStyle('click_to_install')} onClick={() => handleSort('click_to_install')}>
                C2I% <SortIcon column="click_to_install" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th style={thStyle('cpm')} onClick={() => handleSort('cpm')}>
                CPM <SortIcon column="cpm" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th style={thStyle('cpi')} onClick={() => handleSort('cpi')}>
                CPI <SortIcon column="cpi" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th style={thStyle('hook_rate')} onClick={() => handleSort('hook_rate')}>
                Hook% <SortIcon column="hook_rate" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th style={{ minWidth: 120 }}>L1 Status</th>
              <th style={{ minWidth: 100 }}>L2 Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 12 }).map((_, j) => (
                    <td key={j}>
                      <div className="h-4 rounded shimmer" style={{ width: j === 0 ? 180 : 60 }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={12} className="text-center py-16" style={{ color: '#475569' }}>
                  {ads.length === 0
                    ? 'No ad data found for this campaign and date range.'
                    : 'No ads match the current filters.'}
                </td>
              </tr>
            ) : (
              filtered.map((ad) => (
                <tr
                  key={ad.ad_id}
                  className={`row-${ad.decision_result.decision}`}
                >
                  {/* Creative preview + name */}
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="thumbnail-container">
                        {ad.thumbnail_url ? (
                          <>
                            <Image
                              src={ad.thumbnail_url}
                              alt={ad.ad_name}
                              width={48}
                              height={48}
                              className="object-cover"
                              unoptimized
                            />
                            <div className="play-overlay">
                              <Play size={14} className="text-white" />
                            </div>
                          </>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-lg">
                            🎬
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div
                          className="text-xs font-medium truncate max-w-[220px]"
                          style={{ color: '#e2e8f0' }}
                          title={ad.ad_name}
                        >
                          {ad.ad_name.replace(/^TSH\d+_/, '')}
                        </div>
                        <div className="text-[10px] mt-0.5" style={{ color: '#475569', fontFamily: 'monospace' }}>
                          #{ad.ad_id.slice(-6)}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="font-medium text-slate-200">{fmtCurr(ad.spend)}</td>
                  <td style={{ color: '#94a3b8' }}>
                    {ad.impressions >= 10000
                      ? fmtK(ad.impressions)
                      : (
                        <div className="flex flex-col items-end gap-0.5">
                          <span style={{ color: '#f59e0b', fontSize: '11px', fontWeight: 500 }}>{fmtK(ad.impressions)}</span>
                          <div style={{ background: '#1e2d4a', borderRadius: 2, height: 3, width: 48 }}>
                            <div style={{
                              background: '#f59e0b',
                              borderRadius: 2,
                              height: 3,
                              width: `${Math.min((ad.impressions / 10000) * 100, 100)}%`,
                            }} />
                          </div>
                        </div>
                      )
                    }
                  </td>
                  <td style={{ color: '#94a3b8' }}>{ad.installs > 0 ? ad.installs : '—'}</td>
                  <td><IPMCell ipm={ad.ipm} config={config} maxIPM={maxIPM} /></td>
                  <td style={{ color: '#94a3b8' }}>{ad.ctr > 0 ? `${ad.ctr.toFixed(2)}%` : '—'}</td>
                  <td style={{ color: '#94a3b8' }}>{ad.click_to_install > 0 ? `${ad.click_to_install.toFixed(1)}%` : '—'}</td>
                  <td style={{ color: '#94a3b8' }}>{fmtCurr(ad.cpm)}</td>
                  <td style={{ color: '#94a3b8' }}>{fmtCurr(ad.cpi)}</td>
                  <td style={{ color: ad.hook_rate > 0 && ad.hook_rate < config.hook_rate_warning ? '#f59e0b' : '#94a3b8' }}>
                    {fmt(ad.hook_rate, 1)}{ad.hook_rate > 0 ? '%' : ''}
                  </td>
                  <td><DecisionBadge result={ad.decision_result} /></td>
                  <td>
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1.5 w-max" style={{ 
                      background: ad.layer2_status === 'Đang test' ? 'rgba(59,130,246,0.15)' : 
                                 ad.layer2_status === 'Đã test' ? 'rgba(16,185,129,0.15)' : 
                                 ad.layer2_status === 'Không test' ? 'rgba(239,68,68,0.15)' : 'rgba(100,116,139,0.15)',
                      color: ad.layer2_status === 'Đang test' ? '#60a5fa' : 
                             ad.layer2_status === 'Đã test' ? '#34d399' : 
                             ad.layer2_status === 'Không test' ? '#f87171' : '#94a3b8',
                      border: `1px solid ${ad.layer2_status === 'Đang test' ? 'rgba(59,130,246,0.3)' : 
                                           ad.layer2_status === 'Đã test' ? 'rgba(16,185,129,0.3)' : 
                                           ad.layer2_status === 'Không test' ? 'rgba(239,68,68,0.3)' : 'rgba(100,116,139,0.3)'}`,
                      boxShadow: ad.layer2_status === 'Đang test' ? '0 0 10px rgba(59,130,246,0.1)' : 
                                 ad.layer2_status === 'Đã test' ? '0 0 10px rgba(16,185,129,0.1)' : 'none'
                    }}>
                      {ad.layer2_status === 'Đang test' && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />}
                      {ad.layer2_status === 'Đã test' && '✅'}
                      {ad.layer2_status === 'Không test' && '⛔'}
                      {(!ad.layer2_status || ad.layer2_status === 'Chưa test') && '⏳'}
                      {ad.layer2_status || 'Chưa test'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && filtered.length > 0 && (
        <div className="px-5 py-3 text-xs" style={{ color: '#475569', borderTop: '1px solid #1e2d4a' }}>
          Showing {filtered.length} of {ads.length} creatives
          {filterDecision !== 'all' || filterStatus !== 'all' ? ' (filtered)' : ''}
        </div>
      )}
    </div>
  );
}

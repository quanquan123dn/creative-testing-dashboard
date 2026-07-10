'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { scoreAppLovinCreative, FB_LAYER2_DEFAULT_CONFIG, AppLovinDecisionConfig, AppLovinDecisionResult } from '@/lib/applovin-decision-engine';
import { extractCreativeCode } from '@/lib/utils';
import { DollarSign, TrendingUp, ShoppingCart, Download, Trophy, Upload, CheckCircle, Play } from 'lucide-react';
import { exportToCSV } from '@/lib/export';
import VideoPreviewModal from './VideoPreviewModal';
import Image from 'next/image';

interface EnrichedAd {
  ad_name: string;
  test_date: string;
  campaign: string;
  media_source: string;
  impressions: number;
  clicks: number;
  installs: number;
  cost: number;
  revenue: number;
  roi: number;
  purchasers: number;
  purchase_revenue: number;
  ctr: number;
  cpi: number;
  cpm: number;
  ipm: number;
  cpa: number;
  buyer_rate: number;
  buyer_rate_d3: number;
  roas_d3: number;
  has_af_data: boolean;
  video_id?: string;
  thumbnail_url?: string;
  decision_result: AppLovinDecisionResult;
}

type StatusFilter = 'all' | 'winner' | 'watching' | 'fail' | 'new';

type SortKey = 'ad_name' | 'test_date' | 'cost' | 'impressions' | 'installs' | 'roi' | 'buyer_rate' | 'buyer_rate_d3' | 'roas_d3' | 'purchasers' | 'ctr' | 'cpm' | 'cpi' | 'ipm' | 'cpa';

interface AFUploadRow {
  adset_name: string;
  roas_d3: number;
  buyer_rate_d3: number;
  [key: string]: string | number;
}

export default function Layer2VideoTab({ gameId = 'epic-stickman' }: { gameId?: string }) {
  const [ads, setAds] = useState<EnrichedAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('cost');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [config] = useState<AppLovinDecisionConfig>(FB_LAYER2_DEFAULT_CONFIG);
  const [uploading, setUploading] = useState(false);
  const [uploadInfo, setUploadInfo] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [previewAd, setPreviewAd] = useState<EnrichedAd | null>(null);

  const fetchData = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const forceParam = force ? '?force=true' : '';
      
      // Fetch Meta data + uploaded AppsFlyer CSV data in parallel
      const [metaRes, afUploadRes] = await Promise.all([
        fetch(`/api/layer2-meta-insights?game=${gameId}${force ? '&force=true' : ''}`),
        fetch('/api/appsflyer-upload'),
      ]);
      
      const metaJson = await metaRes.json();
      const afUploadJson = await afUploadRes.json();
      
      if (!metaJson.success) throw new Error(metaJson.error || 'Failed to fetch Meta data');

      const metaAds = (metaJson.data?.ads || []).filter((metaAd: any) => metaAd.spend >= 0.01);
      
      // Get uploaded AppsFlyer data (from CSV)
      const afRows: AFUploadRow[] = afUploadJson.data?.rows || [];
      
      if (afRows.length > 0) {
        setUploadInfo(`📊 AppsFlyer: ${afRows.length} adsets (updated ${new Date(afUploadJson.data.uploaded_at).toLocaleString('vi-VN')})`);
      } else {
        setUploadInfo(null);
      }

      console.log(`[L2V] Meta ads: ${metaAds.length}, AF uploaded rows: ${afRows.length}`);

      const enriched: EnrichedAd[] = metaAds.map((metaAd: any) => {
        const metaCode = extractCreativeCode(metaAd.ad_name);
        const metaNameLower = metaAd.ad_name.toLowerCase();
        
        // Multi-strategy matching (priority order):
        // 1. Exact creative code (PA0160 === PA0160)
        // 2. Name substring match
        // 3. All key words of AF name appear in Meta name
        const afMatch = afRows.find(r => {
          const afCode = extractCreativeCode(r.adset_name);
          const afNameLower = r.adset_name.toLowerCase();
          if (metaCode && afCode && metaCode === afCode) return true;
          if (metaNameLower.includes(afNameLower) || afNameLower.includes(metaNameLower)) return true;
          if (afNameLower.length > 5) {
            const afWords = afNameLower.split(/[\s_\-]+/).filter((w: string) => w.length > 3);
            if (afWords.length > 0 && afWords.every((w: string) => metaNameLower.includes(w))) return true;
          }
          return false;
        });

        const spend = metaAd.spend || 0;
        const impressions = metaAd.impressions || 0;
        const installs = metaAd.installs || 0;
        const cpm = metaAd.cpm || 0;
        const cpi = metaAd.cpi || 0;
        const ctr = metaAd.ctr || 0;
        const ipm = impressions > 0 ? (installs / impressions) * 1000 : 0;

        const roas_d3 = afMatch ? afMatch.roas_d3 : 0;
        const buyer_rate_d3 = afMatch ? afMatch.buyer_rate_d3 : 0;

        // Use actual unique_purchasers_d3 from CSV if available, otherwise estimate
        const actual_purchasers = afMatch?.unique_purchasers_d3 != null ? Number(afMatch.unique_purchasers_d3) : 0;
        const estimated_purchasers = actual_purchasers > 0
          ? actual_purchasers
          : (afMatch && buyer_rate_d3 > 0 && installs > 0
            ? Math.round((buyer_rate_d3 / 100) * installs)
            : 0);

        return {
          ad_name: metaAd.ad_name,
          test_date: metaAd.created_time || metaAd.date_start || '',
          campaign: metaAd.campaign || 'Layer 2',
          media_source: 'Facebook',
          impressions,
          clicks: metaAd.clicks || 0,
          installs,
          cost: spend,
          revenue: 0,
          roi: roas_d3,
          purchasers: estimated_purchasers,
          purchase_revenue: 0,
          ctr,
          cpi,
          cpm,
          ipm,
          cpa: 0,
          buyer_rate: buyer_rate_d3,
          buyer_rate_d3,
          roas_d3,
          has_af_data: !!afMatch,
          video_id: metaAd.video_id || '',
          thumbnail_url: metaAd.thumbnail_url || '',
          // If adset is still ACTIVE → "Testing", if PAUSED → score Pass/Iterate/Fail
          decision_result: (metaAd.adset_status === 'ACTIVE')
            ? {
                decision: 'new' as const,
                label: 'Testing',
                emoji: '🧪',
                hexColor: '#38bdf8',
                hexBg: 'rgba(56,189,248,0.12)',
                hexBorder: 'rgba(56,189,248,0.3)',
                reason: 'Adset đang chạy — chờ kết quả',
                warnings: [],
              }
            : scoreAppLovinCreative({
                roas_3d: roas_d3,
                buyer_rate: buyer_rate_d3,
                spend,
                installs,
                cost: spend,
                sales_3d: afMatch ? 999 : 0,
              }, config),
        };
      });

      setAds(enriched);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [config, gameId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setUploading(true);
    try {
      const formData = new FormData();
      // Append all selected files
      Array.from(files).forEach(file => formData.append('file', file));
      
      const res = await fetch('/api/appsflyer-upload', {
        method: 'POST',
        body: formData,
      });
      
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      
      alert(`✅ Upload thành công! ${json.message}`);
      // Reload data
      fetchData(true);
    } catch (err: unknown) {
      alert(`❌ Upload lỗi: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleClearData = async () => {
    if (!confirm('Xóa toàn bộ dữ liệu AppsFlyer đã upload?')) return;
    try {
      const res = await fetch('/api/appsflyer-upload', { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      alert('✅ Đã xóa dữ liệu AppsFlyer');
      fetchData(true);
    } catch (err: unknown) {
      alert(`❌ Lỗi: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const filteredAds = useMemo(() => {
    if (statusFilter === 'all') return ads;
    return ads.filter(a => a.decision_result.decision === statusFilter);
  }, [ads, statusFilter]);

  const sortedAds = useMemo(() => {
    return [...filteredAds].sort((a, b) => {
      const aVal = (a as any)[sortKey];
      const bVal = (b as any)[sortKey];
      if (typeof aVal === 'string') {
        const aCode = extractCreativeCode(aVal);
        const bCode = extractCreativeCode(bVal as string);
        return sortDir === 'asc' ? aCode.localeCompare(bCode) : bCode.localeCompare(aCode);
      }
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [filteredAds, sortKey, sortDir]);

  const filterCounts = useMemo(() => {
    const counts = { all: ads.length, winner: 0, watching: 0, fail: 0, new: 0 };
    ads.forEach(a => {
      const d = a.decision_result.decision;
      if (d in counts) counts[d as keyof typeof counts]++;
    });
    return counts;
  }, [ads]);

  const totalSpend = ads.reduce((s, a) => s + a.cost, 0);
  const totalInstalls = ads.reduce((s, a) => s + a.installs, 0);
  const totalImpressions = ads.reduce((s, a) => s + a.impressions, 0);
  const adsWithAF = ads.filter(a => a.has_af_data);
  const avgRoasD3 = adsWithAF.length > 0 ? adsWithAF.reduce((s, a) => s + a.roas_d3, 0) / adsWithAF.length : 0;
  const avgBuyerD3 = adsWithAF.length > 0 ? adsWithAF.reduce((s, a) => s + a.buyer_rate_d3, 0) / adsWithAF.length : 0;
  const avgCPI = totalInstalls > 0 ? totalSpend / totalInstalls : 0;
  const winners = ads.filter(a => a.decision_result.decision === 'winner').length;
  const watching = ads.filter(a => a.decision_result.decision === 'watching').length;
  const fails = ads.filter(a => a.decision_result.decision === 'fail').length;
  const total = ads.length;

  const formatCurrency = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toFixed(2)}`;

  const sortArrow = (key: SortKey) => {
    if (sortKey !== key) return null;
    return <span style={{ color: '#60a5fa', fontSize: '10px' }}> {sortDir === 'asc' ? '\u2191' : '\u2193'}</span>;
  };

  const columns: { key: SortKey; label: string; align?: 'right' | 'left'; width?: string }[] = [
    { key: 'ad_name', label: 'Ad Creative', align: 'left', width: '180px' },
    { key: 'test_date', label: 'Test Date', align: 'left', width: '95px' },
    { key: 'cost', label: 'Spend', align: 'right', width: '85px' },
    { key: 'installs', label: 'Installs', align: 'right', width: '70px' },
    { key: 'ipm', label: 'IPM', align: 'right', width: '70px' },
    { key: 'roi', label: 'ROAS D3', align: 'right', width: '90px' },
    { key: 'buyer_rate_d3', label: 'Buyer D3', align: 'right', width: '85px' },
    { key: 'purchasers', label: 'Purchasers', align: 'right', width: '80px' },
    { key: 'cpa', label: 'CPA', align: 'right', width: '80px' },
    { key: 'ctr', label: 'CTR', align: 'right', width: '65px' },
    { key: 'cpm', label: 'CPM', align: 'right', width: '70px' },
    { key: 'cpi', label: 'CPI', align: 'right', width: '70px' },
  ];

  const getRoiColor = (roi: number) => {
    if (roi >= 68) return '#10b981';
    if (roi >= 40) return '#f59e0b';
    if (roi > 0) return '#ef4444';
    return '#475569';
  };

  const kpiCards = [
    { id: 'l2v-spend', icon: <DollarSign size={20} />, label: 'Total Spend', value: formatCurrency(totalSpend), color: '#8b5cf6', sub: `${ads.length} ads` },
    { id: 'l2v-roi', icon: <TrendingUp size={20} />, label: 'ROAS D3', value: `${avgRoasD3.toFixed(1)}%`, color: getRoiColor(avgRoasD3), sub: `Benchmark: 68%`, highlight: true },
    { id: 'l2v-buyer', icon: <ShoppingCart size={20} />, label: 'Buyer Rate D3', value: `${avgBuyerD3.toFixed(1)}%`, color: avgBuyerD3 >= 9.5 ? '#10b981' : avgBuyerD3 >= 6 ? '#f59e0b' : '#ef4444', sub: `Benchmark: 9.5%` },
    { id: 'l2v-installs', icon: <Download size={20} />, label: 'Total Installs', value: totalInstalls.toLocaleString(), color: '#06b6d4', sub: `${adsWithAF.length} matched` },
    { id: 'l2v-decisions', icon: <Trophy size={20} />, label: 'Decisions', color: '#8b5cf6', sub: `${winners + watching + fails} scored`, isDecision: true, winners, watching, fails },
  ];

  const testedAds = ads.filter(a => a.has_af_data && a.roas_d3 > 0);
  const roiLeaderboard = [...testedAds].sort((a, b) => b.roas_d3 - a.roas_d3).slice(0, 5).map(a => ({ name: a.ad_name, value: a.roas_d3, formatted: `${a.roas_d3.toFixed(1)}%` }));
  const buyerLeaderboard = [...testedAds].sort((a, b) => b.buyer_rate_d3 - a.buyer_rate_d3).slice(0, 5).map(a => ({ name: a.ad_name, value: a.buyer_rate_d3, formatted: `${a.buyer_rate_d3.toFixed(1)}%` }));

  return (
    <div className="space-y-5 fade-in-up">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpiCards.map((card: any) => (
          <div key={card.id} id={card.id} className="glass-card p-4 fade-in-up" style={{ borderLeft: `2px solid ${card.color}30` }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-base">{card.icon}</span>
              <span className="w-2 h-2 rounded-full" style={{ background: card.color, opacity: 0.7 }} />
            </div>
            <div className="text-xs mb-1" style={{ color: '#64748b' }}>{card.label}</div>
            {loading ? (
              <div className="h-6 rounded shimmer" />
            ) : card.isDecision ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold flex items-center gap-1" style={{ color: '#10b981' }}><Trophy size={14}/> {card.winners}</span>
                <span className="text-sm font-bold flex items-center gap-1" style={{ color: '#f59e0b' }}><span className="text-[12px]">⏳</span> {card.watching}</span>
                <span className="text-sm font-bold flex items-center gap-1" style={{ color: '#ef4444' }}><span className="text-[12px]">❌</span> {card.fails}</span>
              </div>
            ) : (
              <div className="text-lg font-bold" style={{ color: card.highlight ? getRoiColor(avgRoasD3) : card.color }}>
                {card.value}
              </div>
            )}
            {!loading && card.sub && (
              <div className="text-[11px] mt-1" style={{ color: '#94a3b8' }}>{card.sub}</div>
            )}
          </div>
        ))}
      </div>

      {/* Leaderboard */}
      {!loading && testedAds.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="glass-card p-4">
            <h3 className="text-sm font-semibold text-slate-200 mb-3">🏆 Top ROI</h3>
            {roiLeaderboard.map((item, i) => {
              const max = Math.max(...roiLeaderboard.map(x => x.value), 100);
              return (
                <div key={i} className="mb-2">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-slate-300 truncate mr-2">{i + 1}. {item.name}</span>
                    <span className="text-xs font-bold" style={{ color: '#10b981' }}>{item.formatted}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#1e2d4a' }}>
                    <div className="h-full rounded-full" style={{ width: `${(item.value / max) * 100}%`, background: '#10b981' }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="glass-card p-4">
            <h3 className="text-sm font-semibold text-slate-200 mb-3">🛒 Top Buyer Rate D3</h3>
            {buyerLeaderboard.map((item, i) => {
              const max = Math.max(...buyerLeaderboard.map(x => x.value), 10);
              return (
                <div key={i} className="mb-2">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-slate-300 truncate mr-2">{i + 1}. {item.name}</span>
                    <span className="text-xs font-bold" style={{ color: '#8b5cf6' }}>{item.formatted}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#1e2d4a' }}>
                    <div className="h-full rounded-full" style={{ width: `${(item.value / max) * 100}%`, background: '#8b5cf6' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-slate-200">🎬 Layer 2 Video (Facebook) Performance</h2>
            {!loading && (
              <span className="px-2.5 py-1 rounded-full text-xs font-medium" style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)', color: '#60a5fa' }}>
                {ads.length} ads
              </span>
            )}
            <button onClick={() => fetchData(true)} disabled={loading}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#60a5fa' }}>
              🔄 Sync
            </button>
            {/* Upload CSV button */}
            <input type="file" ref={fileInputRef} accept=".csv,.tsv,.txt" onChange={handleUpload} className="hidden" multiple />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5"
              style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa' }}>
              {uploading ? '⏳ Uploading...' : <><Upload size={12} /> Upload CSV</>}
            </button>
          </div>
          {/* Status Filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs" style={{ color: '#64748b' }}>Filter:</span>
            {([
              { key: 'all' as StatusFilter, label: `All (${filterCounts.all})`, emoji: '' },
              { key: 'new' as StatusFilter, label: `Testing (${filterCounts.new})`, emoji: '🧪' },
              { key: 'winner' as StatusFilter, label: `Pass (${filterCounts.winner})`, emoji: '🏆' },
              { key: 'watching' as StatusFilter, label: `Iterate (${filterCounts.watching})`, emoji: '⏳' },
              { key: 'fail' as StatusFilter, label: `Fail (${filterCounts.fail})`, emoji: '❌' },
            ]).map(f => {
              const active = statusFilter === f.key;
              return (
                <button key={f.key} onClick={() => setStatusFilter(f.key)}
                  className="px-2.5 py-1 rounded text-xs font-medium transition-all"
                  style={{
                    background: active ? 'rgba(59,130,246,0.15)' : 'transparent',
                    border: `1px solid ${active ? 'rgba(59,130,246,0.4)' : '#1e2d4a'}`,
                    color: active ? '#60a5fa' : '#64748b',
                  }}>
                  {f.emoji} {f.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-3">
            {uploadInfo && (
              <span className="flex items-center gap-1.5 text-xs" style={{ color: '#10b981' }}>
                <CheckCircle size={12} /> {uploadInfo}
              </span>
            )}
            {uploadInfo && (
              <button onClick={handleClearData}
                className="px-2 py-1 rounded text-[10px] font-medium transition-all hover:scale-105"
                style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}
                title="Xóa dữ liệu AppsFlyer đã upload"
              >
                🗑️ Clear
              </button>
            )}
            <span className="text-xs" style={{ color: '#64748b' }}>Last 14 days (via AppsFlyer)</span>
            <button
              onClick={() => exportToCSV(
                ads.map(a => ({
                  creative: a.ad_name,
                  decision: a.decision_result.label,
                  cost: a.cost,
                  impressions: a.impressions,
                  installs: a.installs,
                  roas: a.roas_d3,
                  sales: a.purchase_revenue,
                  buyer_rate: a.buyer_rate,
                  ctr: a.ctr,
                  cpm: a.cpm,
                  cpi: a.cpi,
                  test_date: a.test_date || '',
                })),
                [
                  { key: 'creative', label: 'Creative' },
                  { key: 'decision', label: 'Decision' },
                  { key: 'cost', label: 'Cost' },
                  { key: 'impressions', label: 'Impressions' },
                  { key: 'installs', label: 'Installs' },
                  { key: 'roas', label: 'ROAS' },
                  { key: 'sales', label: 'Sales' },
                  { key: 'buyer_rate', label: 'Buyer Rate' },
                  { key: 'ctr', label: 'CTR' },
                  { key: 'cpm', label: 'CPM' },
                  { key: 'cpi', label: 'CPI' },
                  { key: 'test_date', label: 'Test Date' },
                ],
                'layer2_video'
              )}
              className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all hover:scale-105"
              style={{
                background: 'rgba(34,197,94,0.12)',
                color: '#4ade80',
                border: '1px solid rgba(34,197,94,0.25)',
              }}
              title="Export to CSV"
            >
              <Download size={13} />
              Export
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg text-xs" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}>
            ⚠️ {error}
          </div>
        )}

        <div className="overflow-x-auto" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr style={{ background: '#0f1629' }}>
                <th className="px-3 py-3 text-left text-xs font-medium" style={{ color: '#64748b', width: '40px' }}>#</th>
                {columns.map(col => (
                  <th key={col.key}
                    className={`px-3 py-3 text-xs font-medium cursor-pointer hover:text-slate-300 transition-colors ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                    style={{ color: sortKey === col.key ? '#60a5fa' : '#64748b', width: col.width }}
                    onClick={() => handleSort(col.key)}
                  >
                    {col.label}{sortArrow(col.key)}
                  </th>
                ))}
                <th className="px-3 py-3 text-left text-xs font-medium" style={{ color: '#64748b', width: '70px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #1e2d4a' }}>
                    {Array.from({ length: 14 }).map((_, j) => (
                      <td key={j} className="px-3 py-3"><div className="h-4 rounded shimmer" /></td>
                    ))}
                  </tr>
                ))
              ) : sortedAds.length === 0 ? (
                <tr><td colSpan={14} className="px-3 py-12 text-center text-sm" style={{ color: '#64748b' }}>No ad data found</td></tr>
              ) : (
                sortedAds.map((ad, idx) => {
                  const dr = ad.decision_result;
                  return (
                    <tr key={`${ad.ad_name}-${idx}`} className="transition-colors"
                      style={{ borderBottom: '1px solid #1e2d4a', background: idx % 2 === 0 ? 'transparent' : 'rgba(15,22,41,0.3)' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(59,130,246,0.04)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = idx % 2 === 0 ? 'transparent' : 'rgba(15,22,41,0.3)'; }}
                    >
                      <td className="px-3 py-3 text-xs" style={{ color: '#475569' }}>{idx + 1}</td>
                      <td className="px-3 py-3 text-left">
                        <div className="flex items-center gap-2.5">
                          <div className="thumbnail-container" style={{ cursor: ad.video_id ? 'pointer' : 'default', width: 40, height: 40, minWidth: 40, borderRadius: 6, overflow: 'hidden', position: 'relative' }} onClick={() => { if (ad.video_id) setPreviewAd(ad); }}>
                            {ad.thumbnail_url ? (
                              <>
                                <Image src={ad.thumbnail_url} alt={ad.ad_name} width={40} height={40} className="object-cover" unoptimized style={{ width: '100%', height: '100%' }} />
                                {ad.video_id && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)', opacity: 0.7 }}><Play size={14} className="text-white" /></div>}
                              </>
                            ) : (
                              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1e2d4a', fontSize: 16 }}>🎬</div>
                            )}
                          </div>
                          <div className="font-medium text-slate-200 text-xs truncate min-w-0" title={ad.ad_name}>{ad.ad_name}</div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-left text-xs" style={{ color: '#94a3b8' }}>
                        {ad.test_date ? new Date(ad.test_date).toLocaleDateString('vi-VN') : '-'}
                      </td>
                      <td className="px-3 py-3 text-right text-xs" style={{ color: '#94a3b8' }}>{formatCurrency(ad.cost)}</td>
                      <td className="px-3 py-3 text-right text-xs font-medium" style={{ color: '#e2e8f0' }}>{ad.installs.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right text-xs" style={{ color: '#94a3b8' }}>{ad.ipm.toFixed(2)}</td>
                      {/* ROAS D3 — EMPHASIZED */}
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-14 h-2 rounded-full overflow-hidden" style={{ background: '#1e2d4a' }}>
                            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(Math.abs(ad.roas_d3), 100)}%`, background: getRoiColor(ad.roas_d3) }} />
                          </div>
                          <span className="text-sm font-bold" style={{ color: getRoiColor(ad.roi), minWidth: '52px', textAlign: 'right' }}>
                            {ad.has_af_data ? `${ad.roi.toFixed(1)}%` : 'N/A'}
                          </span>
                        </div>
                      </td>
                      {/* Buyer Rate D3 — EMPHASIZED */}
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-14 h-2 rounded-full overflow-hidden" style={{ background: '#1e2d4a' }}>
                            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(ad.buyer_rate_d3 * 5, 100)}%`, background: ad.buyer_rate_d3 >= 9.5 ? '#10b981' : ad.buyer_rate_d3 >= 6 ? '#f59e0b' : '#ef4444' }} />
                          </div>
                          <span className="text-sm font-bold" style={{ color: ad.buyer_rate_d3 >= 9.5 ? '#10b981' : ad.buyer_rate_d3 >= 6 ? '#f59e0b' : ad.buyer_rate_d3 > 0 ? '#ef4444' : '#94a3b8', minWidth: '52px', textAlign: 'right' }}>
                            {ad.has_af_data ? (ad.buyer_rate_d3 > 0 ? `${ad.buyer_rate_d3.toFixed(1)}%` : '—') : 'N/A'}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right text-xs" style={{ color: '#94a3b8' }}>{ad.has_af_data ? (ad.purchasers > 0 ? ad.purchasers : '\u2014') : 'N/A'}</td>
                      <td className="px-3 py-3 text-right text-xs" style={{ color: '#94a3b8' }}>{ad.has_af_data ? (ad.cpa > 0 ? formatCurrency(ad.cpa) : '\u2014') : 'N/A'}</td>
                      <td className="px-3 py-3 text-right text-xs" style={{ color: '#94a3b8' }}>{ad.ctr.toFixed(2)}%</td>
                      <td className="px-3 py-3 text-right text-xs" style={{ color: '#94a3b8' }}>{formatCurrency(ad.cpm)}</td>
                      <td className="px-3 py-3 text-right text-xs" style={{ color: '#94a3b8' }}>{ad.installs > 0 ? formatCurrency(ad.cpi) : '\u2014'}</td>
                      <td className="px-3 py-3">
                        <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
                          style={{ background: dr.hexBg, border: `1px solid ${dr.hexBorder}`, color: dr.hexColor }}
                          title={dr.reason}
                        >
                          {dr.emoji} {dr.label}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Distribution */}
      {!loading && total > 0 && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-4">📊 Layer 2 Video Distribution</h3>
          <div className="flex items-center gap-6">
            <div className="flex-1">
              <div className="flex rounded-full overflow-hidden h-4" style={{ background: '#1e2d4a' }}>
                {winners > 0 && <div style={{ width: `${(winners / total) * 100}%`, background: '#10b981' }} className="transition-all" />}
                {watching > 0 && <div style={{ width: `${(watching / total) * 100}%`, background: '#f59e0b' }} className="transition-all" />}
                {fails > 0 && <div style={{ width: `${(fails / total) * 100}%`, background: '#ef4444' }} className="transition-all" />}
                {(total - winners - watching - fails) > 0 && <div style={{ width: `${((total - winners - watching - fails) / total) * 100}%`, background: '#3b82f6' }} className="transition-all" />}
              </div>
            </div>
            <div className="flex gap-4 text-xs">
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded" style={{ background: '#10b981' }} /><span style={{ color: '#94a3b8' }}>Pass ({winners})</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded" style={{ background: '#f59e0b' }} /><span style={{ color: '#94a3b8' }}>Iterate ({watching})</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded" style={{ background: '#ef4444' }} /><span style={{ color: '#94a3b8' }}>Fail ({fails})</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded" style={{ background: '#3b82f6' }} /><span style={{ color: '#94a3b8' }}>Testing ({total - winners - watching - fails})</span></div>
            </div>
          </div>
        </div>
      )}

      {/* Video Preview Modal */}
      {previewAd && (
        <VideoPreviewModal
          videoId={previewAd.video_id || ''}
          adId=""
          adName={previewAd.ad_name}
          thumbnailUrl={previewAd.thumbnail_url || ''}
          onClose={() => setPreviewAd(null)}
        />
      )}
    </div>
  );
}

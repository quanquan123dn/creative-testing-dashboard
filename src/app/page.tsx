'use client';

import { useState, useEffect, useCallback } from 'react';
import { AdInsight } from '@/lib/meta-api';
import { extractCreativeCode } from '@/lib/utils';
import { scoreCreative, DEFAULT_CONFIG, DecisionConfig } from '@/lib/decision-engine';
import VideoTab from '@/components/VideoTab';
import PLATab from '@/components/PLATab';
import AppLovinTab from '@/components/AppLovinTab';
import Layer2VideoTab from '@/components/Layer2VideoTab';
import Header from '@/components/Header';

export interface EnrichedAd extends AdInsight {
  decision_result: ReturnType<typeof scoreCreative>;
  layer2_status?: string;
}

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<'video' | 'pla' | 'applovin' | 'layer2video'>('video');
  const [datePreset, setDatePreset] = useState('last_30d');
  const [ads, setAds] = useState<EnrichedAd[]>([]);
  const [campaignName, setCampaignName] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [config] = useState<DecisionConfig>(DEFAULT_CONFIG);

  const fetchData = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const forceParamStr = force ? '&force=true' : '';
      const [res, l2Res] = await Promise.all([
        fetch(`/api/insights?date_preset=${datePreset}${forceParamStr}`),
        fetch(`/api/layer2-meta-insights${force ? '?force=true' : ''}`)
      ]);
      const json = await res.json();
      const l2Json = await l2Res.json();
      if (!json.success) throw new Error(json.error);

      const l2Ads = l2Json.success ? (l2Json.data?.ads || []) : [];

      const enriched: EnrichedAd[] = (json.data.ads || []).map((ad: AdInsight) => {
        const decision_result = scoreCreative(
          {
            ipm: ad.ipm,
            spend: ad.spend,
            installs: ad.installs,
            impressions: ad.impressions,
            frequency: ad.frequency,
            hook_rate: ad.hook_rate,
            click_to_install: ad.click_to_install,
          },
          config
        );

        let layer2_status = 'Chưa test';
        const creativeCode = extractCreativeCode(ad.ad_name);
        const benchmarkCodes = ['VE0001', 'VE0193', 'VE0217', 'VE0163'];
        
        if (benchmarkCodes.includes(creativeCode)) {
          layer2_status = 'Không test';
        } else if (decision_result.decision === 'kill') {
          layer2_status = 'Không test';
        } else {
          const l2Ad = l2Ads.find((a: any) => 
            a.ad_name.replace(/^TSH\d+_/, '').toLowerCase().trim() === 
            ad.ad_name.replace(/^TSH\d+_/, '').toLowerCase().trim()
          );
          if (l2Ad) {
            layer2_status = l2Ad.adset_status === 'ACTIVE' ? 'Đang test' : 'Đã test';
          }
        }

        return {
          ...ad,
          decision_result,
          layer2_status
        };
      });

      setAds(enriched);
      setCampaignName(json.data.campaign?.name || null);
      setLastSync(json.data.cachedAt || json.data.lastSync || null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [datePreset, config]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="min-h-screen" style={{ background: '#0a0e1a' }}>
      <Header
        campaignName={campaignName}
        lastSync={lastSync}
        loading={loading}
        datePreset={datePreset}
        onDatePresetChange={setDatePreset}
        onSync={fetchData}
      />

      {/* Tab Navigation */}
      <div className="border-b" style={{ borderColor: '#1e2d4a', background: '#0f1629' }}>
        <div className="max-w-[1600px] mx-auto px-6">
          <div className="flex gap-1 pt-2">
            <button
              onClick={() => setActiveTab('video')}
              className={`px-5 py-3 rounded-t-lg text-sm font-medium border border-b-0 transition-all duration-200 ${
                activeTab === 'video' ? 'tab-active' : 'tab-inactive'
              }`}
              id="tab-video"
            >
              📹 Test Video
            </button>
            <button
              onClick={() => setActiveTab('pla')}
              className={`px-5 py-3 rounded-t-lg text-sm font-medium border border-b-0 transition-all duration-200 ${
                activeTab === 'pla' ? 'tab-active' : 'tab-inactive'
              }`}
              id="tab-pla"
            >
              🖼️ Test PLA
            </button>
            <button
              onClick={() => setActiveTab('applovin')}
              className={`px-5 py-3 rounded-t-lg text-sm font-medium border border-b-0 transition-all duration-200 ${
                activeTab === 'applovin' ? 'tab-active' : 'tab-inactive'
              }`}
              id="tab-applovin"
            >
              🚀 Layer 2 AppLovin
            </button>
            <button
              onClick={() => setActiveTab('layer2video')}
              className={`px-5 py-3 rounded-t-lg text-sm font-medium border border-b-0 transition-all duration-200 ${
                activeTab === 'layer2video' ? 'tab-active' : 'tab-inactive'
              }`}
              id="tab-layer2video"
            >
              🎬 Layer 2 Video
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-[1600px] mx-auto px-6 py-6">
        {error && (
          <div className="mb-4 p-4 rounded-xl border text-sm" style={{
            background: 'rgba(239, 68, 68, 0.08)',
            borderColor: 'rgba(239, 68, 68, 0.3)',
            color: '#fca5a5'
          }}>
            ⚠️ {error}
          </div>
        )}

        {activeTab === 'video' && (
          <VideoTab
            ads={ads}
            loading={loading}
            config={config}
            datePreset={datePreset}
          />
        )}
        {activeTab === 'pla' && <PLATab />}
        {activeTab === 'applovin' && <AppLovinTab />}
        {activeTab === 'layer2video' && <Layer2VideoTab />}
      </div>
    </div>
  );
}

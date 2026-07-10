'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { AdInsight } from '@/lib/meta-api';
import { extractCreativeCode } from '@/lib/utils';
import { scoreCreative, DEFAULT_CONFIG, DecisionConfig } from '@/lib/decision-engine';
import { GAME_LIST, getGameConfig, DEFAULT_GAME_ID, GameConfig } from '@/lib/game-config';
import VideoTab from '@/components/VideoTab';
import PLATab from '@/components/PLATab';
import AppLovinTab from '@/components/AppLovinTab';
import Layer2VideoTab from '@/components/Layer2VideoTab';
import Header from '@/components/Header';

export interface EnrichedAd extends AdInsight {
  decision_result: ReturnType<typeof scoreCreative>;
  layer2_status?: string;
}

type TabKey = 'video' | 'pla' | 'applovin' | 'layer2video';

export default function DashboardPage() {
  const [selectedGameId, setSelectedGameId] = useState(DEFAULT_GAME_ID);
  const [activeTab, setActiveTab] = useState<TabKey>('video');
  const [datePreset, setDatePreset] = useState('last_30d');
  const [ads, setAds] = useState<EnrichedAd[]>([]);
  const [campaignName, setCampaignName] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [config] = useState<DecisionConfig>(DEFAULT_CONFIG);

  const gameConfig = useMemo(() => getGameConfig(selectedGameId), [selectedGameId]);

  // Available tabs based on game config
  const availableTabs = useMemo(() => {
    const tabs: { key: TabKey; label: string; color: string }[] = [];
    if (gameConfig.layers.layer1Video) tabs.push({ key: 'video', label: 'Layer 1 Video', color: 'blue' });
    if (gameConfig.layers.layer1PLA) tabs.push({ key: 'pla', label: 'Layer 1 PLA', color: 'blue' });
    if (gameConfig.layers.layer2AppLovin) tabs.push({ key: 'applovin', label: 'Layer 2 AppLovin', color: 'purple' });
    if (gameConfig.layers.layer2Video) tabs.push({ key: 'layer2video', label: 'Layer 2 Video', color: 'purple' });
    return tabs;
  }, [gameConfig]);

  // Reset tab when switching games if current tab isn't available
  useEffect(() => {
    const tabAvailable = availableTabs.some(t => t.key === activeTab);
    if (!tabAvailable && availableTabs.length > 0) {
      setActiveTab(availableTabs[0].key);
    }
  }, [availableTabs, activeTab]);

  // Reset data when switching games
  const handleGameChange = useCallback((gameId: string) => {
    setSelectedGameId(gameId);
    setAds([]);
    setCampaignName(null);
    setLastSync(null);
    setError(null);
  }, []);

  const fetchData = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const forceParamStr = force ? '&force=true' : '';
      const gameParam = `&game=${selectedGameId}`;
      
      // Fetch Layer 1 Video data
      const fetchPromises: Promise<Response>[] = [
        fetch(`/api/insights?date_preset=${datePreset}${forceParamStr}${gameParam}`)
      ];
      
      // Only fetch L2 data if game has Layer 2
      if (gameConfig.layers.layer2Video) {
        fetchPromises.push(
          fetch(`/api/layer2-meta-insights${force ? '?' : '?'}game=${selectedGameId}${forceParamStr ? '&force=true' : ''}`)
        );
      }
      
      const responses = await Promise.all(fetchPromises);
      const json = await responses[0].json();
      const l2Json = gameConfig.layers.layer2Video && responses[1] ? await responses[1].json() : null;
      
      if (!json.success) throw new Error(json.error);

      const l2Ads = l2Json?.success ? (l2Json.data?.ads || []) : [];

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
        
        // Only calculate L2 status if game has Layer 2
        if (gameConfig.layers.layer2Video) {
          const creativeCode = extractCreativeCode(ad.ad_name);
          const benchmarkCodes = ['VE0001', 'VE0193', 'VE0217', 'VE0163'];
          
          if (benchmarkCodes.includes(creativeCode)) {
            layer2_status = 'Không test';
          } else if (decision_result.decision === 'kill') {
            layer2_status = 'Không test';
          } else if (creativeCode) {
            const l2Ad = l2Ads.find((a: any) => {
              const l2Code = extractCreativeCode(a.ad_name);
              return l2Code === creativeCode;
            });
            if (l2Ad) {
              layer2_status = l2Ad.adset_status === 'ACTIVE' ? 'Đang test' : 'Đã test';
            }
          }
        } else {
          layer2_status = '';
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
  }, [datePreset, config, selectedGameId, gameConfig]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="min-h-screen" style={{ background: '#0a0e1a' }}>
      <div className="sticky top-0 z-20 backdrop-blur-xl" style={{ background: 'rgba(15,22,41,0.85)' }}>
        <Header
          campaignName={campaignName}
          lastSync={lastSync}
          loading={loading}
          datePreset={datePreset}
          onDatePresetChange={setDatePreset}
          onSync={fetchData}
          gameConfig={gameConfig}
          gameList={GAME_LIST}
          onGameChange={handleGameChange}
        />

        {/* Tab Navigation */}
        <div className="border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="max-w-[1600px] mx-auto px-6">
            <div className="flex gap-2">
              {availableTabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-6 py-4 text-sm font-medium border-b-2 transition-all duration-200 rounded-t-xl ${
                    activeTab === tab.key
                      ? `border-${tab.color}-500 text-${tab.color}-400 bg-${tab.color}-500/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]`
                      : 'border-transparent text-slate-400 hover:text-slate-300 hover:bg-white/5'
                  }`}
                  style={activeTab === tab.key ? {
                    borderBottomColor: tab.color === 'purple' ? '#a855f7' : '#3b82f6',
                    color: tab.color === 'purple' ? '#c084fc' : '#60a5fa',
                    background: tab.color === 'purple' ? 'rgba(168,85,247,0.1)' : 'rgba(59,130,246,0.1)',
                  } : undefined}
                  id={`tab-${tab.key}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
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
        {activeTab === 'pla' && <PLATab gameId={selectedGameId} />}
        {activeTab === 'applovin' && <AppLovinTab />}
        {activeTab === 'layer2video' && <Layer2VideoTab gameId={selectedGameId} />}
      </div>
    </div>
  );
}

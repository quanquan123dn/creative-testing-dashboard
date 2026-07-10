/**
 * Multi-game configuration system
 * Each game has its own API credentials, campaign names, layer availability, and benchmarks
 */

export interface GameLayerConfig {
  layer1Video: boolean;
  layer1PLA: boolean;
  layer2Video: boolean;
  layer2AppLovin: boolean;
}

export interface VideoDecisionConfig {
  ipm_winner: number;
  ipm_watching: number;
  min_spend: number;
  min_installs: number;
  min_impressions: number;
  frequency_warning: number;
  hook_rate_warning: number;
}

export interface PLADecisionConfig {
  ipm_winner: number;
  ipm_watching: number;
  min_spend: number;
  min_installs: number;
  min_views: number;
}

export interface GameConfig {
  id: string;
  name: string;
  shortName: string;
  icon: string;

  layers: GameLayerConfig;

  // Meta (Facebook)
  meta: {
    adAccountId: string;
    layer1CampaignName: string;
    layer2CampaignName?: string;
  };

  // Unity PLA
  unity?: {
    campaignId: string;
    campaignName: string;
  };

  // AppLovin
  applovin?: {
    campaignName: string;
  };

  // Decision engine benchmarks
  benchmarks: {
    layer1Video: VideoDecisionConfig;
    layer1PLA?: PLADecisionConfig;
  };
}

// ===== GAME CONFIGS =====

export const GAMES: Record<string, GameConfig> = {
  'epic-stickman': {
    id: 'epic-stickman',
    name: 'Epic Stickman',
    shortName: 'TSH009',
    icon: '⚔️',

    layers: {
      layer1Video: true,
      layer1PLA: true,
      layer2Video: true,
      layer2AppLovin: true,
    },

    meta: {
      adAccountId: process.env.META_AD_ACCOUNT_ID || '2713722828912411',
      layer1CampaignName: process.env.META_CAMPAIGN_NAME || 'TSH009a_May27_US_T4_QuanNHLeo_FB_Layer 1 creative test',
      layer2CampaignName: process.env.META_LAYER2_CAMPAIGN_NAME || 'TSH009a_Jan15_US_T3_QuanNHLeo_FB_Layer 2 creative test',
    },

    unity: {
      campaignId: process.env.UNITY_CAMPAIGN_ID || '699fc56f8572d793bdd5d2df',
      campaignName: process.env.UNITY_CAMPAIGN_NAME || 'TSH009a_Feb26_MX_Creative testing_QuanNHLeo_UNT',
    },

    applovin: {
      campaignName: 'Applovin_TSH009a_Jan17_Tier 0+1_T5_QuanNHLeo_BLDROASD7_Test creative_CPM billing',
    },

    benchmarks: {
      layer1Video: {
        ipm_winner: 7,
        ipm_watching: 6.5,
        min_spend: 10,
        min_installs: 5,
        min_impressions: 10000,
        frequency_warning: 3.5,
        hook_rate_warning: 15,
      },
      layer1PLA: {
        ipm_winner: 15,
        ipm_watching: 13,
        min_spend: 5,
        min_installs: 3,
        min_views: 5000,
      },
    },
  },

  'stickman-defense': {
    id: 'stickman-defense',
    name: 'Stickman Defense',
    shortName: 'THP020',
    icon: '🛡️',

    layers: {
      layer1Video: true,
      layer1PLA: true,
      layer2Video: false,
      layer2AppLovin: false,
    },

    meta: {
      adAccountId: '1377861150588363',
      layer1CampaignName: 'THP020a_Jan22_BR_T4_Signal Test_Linh_FB',
    },

    unity: {
      campaignId: '69b2678c9fc4f6b90be29020',
      campaignName: 'THP020a_Mar12_MX_PA Test_Linh_UNT',
    },

    // No AppLovin for this game

    benchmarks: {
      layer1Video: {
        // Placeholder — user will provide actual benchmarks later
        ipm_winner: 7,
        ipm_watching: 6.5,
        min_spend: 10,
        min_installs: 5,
        min_impressions: 10000,
        frequency_warning: 3.5,
        hook_rate_warning: 15,
      },
      layer1PLA: {
        // Placeholder — user will provide actual benchmarks later
        ipm_winner: 15,
        ipm_watching: 13,
        min_spend: 5,
        min_installs: 3,
        min_views: 5000,
      },
    },
  },
};

export const GAME_LIST = Object.values(GAMES);
export const DEFAULT_GAME_ID = 'epic-stickman';

export function getGameConfig(gameId: string): GameConfig {
  return GAMES[gameId] || GAMES[DEFAULT_GAME_ID];
}

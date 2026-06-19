/**
 * AppLovin Layer 2 Decision Engine
 * Benchmark: ROAS D3 >= 70% AND Buyer Rate >= 5% = Pass
 */

export type AppLovinDecision = 'winner' | 'watching' | 'fail' | 'new';

export interface AppLovinDecisionResult {
  decision: AppLovinDecision;
  label: string;
  emoji: string;
  hexColor: string;
  hexBg: string;
  hexBorder: string;
  reason: string;
  warnings: string[];
}

export interface AppLovinDecisionConfig {
  roas_3d_pass: number;       // ROAS D3 >= this = pass criterion
  buyer_rate_pass: number;    // Buyer Rate >= this = pass criterion
  roas_3d_watching: number;   // ROAS D3 >= this = watching
  buyer_rate_watching: number; // Buyer Rate >= this = watching
  min_spend: number;          // Minimum spend to evaluate
  min_installs: number;       // Minimum installs to evaluate
  min_purchasers: number;     // Minimum D3 purchasers to consider test complete
}

export const APPLOVIN_DEFAULT_CONFIG: AppLovinDecisionConfig = {
  roas_3d_pass: 70,
  buyer_rate_pass: 5,
  roas_3d_watching: 50,
  buyer_rate_watching: 3,
  min_spend: 10,
  min_installs: 5,
  min_purchasers: 10,
};

export function scoreAppLovinCreative(
  metrics: {
    roas_3d: number;
    buyer_rate: number;
    spend: number;
    installs: number;
    cost: number;
    sales_3d: number;
  },
  config: AppLovinDecisionConfig = APPLOVIN_DEFAULT_CONFIG
): AppLovinDecisionResult {
  const warnings: string[] = [];

  // Not enough data - need at least 10 D3 purchasers to consider test complete
  const notEnoughData = metrics.sales_3d < config.min_purchasers;
  if (notEnoughData) {
    const reasons: string[] = [];
    reasons.push(`${metrics.sales_3d}/${config.min_purchasers} purchasers D3`);
    if (metrics.installs < config.min_installs)
      reasons.push(`${metrics.installs}/${config.min_installs} installs`);
    return {
      decision: 'new',
      label: 'New',
      emoji: '🔵',
      hexColor: '#60a5fa',
      hexBg: 'rgba(59,130,246,0.12)',
      hexBorder: 'rgba(59,130,246,0.3)',
      reason: `Chưa đủ data: ${reasons.join(', ')}`,
      warnings,
    };
  }

  // Warnings
  if (metrics.roas_3d > 0 && metrics.roas_3d < config.roas_3d_watching) {
    warnings.push(`Low ROAS D3 (${metrics.roas_3d.toFixed(1)}%)`);
  }
  if (metrics.buyer_rate > 0 && metrics.buyer_rate < config.buyer_rate_watching) {
    warnings.push(`Low Buyer Rate (${metrics.buyer_rate.toFixed(1)}%)`);
  }

  // Pass: BOTH ROAS D3 >= 70% AND Buyer Rate >= 5%
  if (metrics.roas_3d >= config.roas_3d_pass && metrics.buyer_rate >= config.buyer_rate_pass) {
    return {
      decision: 'winner',
      label: 'Pass',
      emoji: '🏆',
      hexColor: '#34d399',
      hexBg: 'rgba(16,185,129,0.12)',
      hexBorder: 'rgba(16,185,129,0.35)',
      reason: `ROAS D3 ${metrics.roas_3d.toFixed(1)}% ≥ ${config.roas_3d_pass}% ✓ | Buyer Rate ${metrics.buyer_rate.toFixed(1)}% ≥ ${config.buyer_rate_pass}% ✓`,
      warnings,
    };
  }

  // Watching: at least one metric is in watching range
  if (metrics.roas_3d >= config.roas_3d_watching || metrics.buyer_rate >= config.buyer_rate_watching) {
    const reasons: string[] = [];
    if (metrics.roas_3d >= config.roas_3d_watching) reasons.push(`ROAS D3 ${metrics.roas_3d.toFixed(1)}%`);
    if (metrics.buyer_rate >= config.buyer_rate_watching) reasons.push(`Buyer Rate ${metrics.buyer_rate.toFixed(1)}%`);
    return {
      decision: 'watching',
      label: 'Iterate',
      emoji: '⏳',
      hexColor: '#fbbf24',
      hexBg: 'rgba(245,158,11,0.12)',
      hexBorder: 'rgba(245,158,11,0.35)',
      reason: reasons.join(' | '),
      warnings,
    };
  }

  // Fail
  return {
    decision: 'fail',
    label: 'Fail',
    emoji: '❌',
    hexColor: '#f87171',
    hexBg: 'rgba(239,68,68,0.12)',
    hexBorder: 'rgba(239,68,68,0.35)',
    reason: `ROAS D3 ${metrics.roas_3d.toFixed(1)}% < ${config.roas_3d_watching}% | Buyer Rate ${metrics.buyer_rate.toFixed(1)}% < ${config.buyer_rate_watching}%`,
    warnings,
  };
}

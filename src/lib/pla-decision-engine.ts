/**
 * PLA Decision Engine
 * Benchmark IPM: 15 (as specified by user)
 * Uses views (not impressions) since Unity reports views
 */

export type PLADecision = 'winner' | 'watching' | 'fail' | 'new';

export interface PLADecisionResult {
  decision: PLADecision;
  label: string;
  emoji: string;
  hexColor: string;
  hexBg: string;
  hexBorder: string;
  reason: string;
  warnings: string[];
}

export interface PLADecisionConfig {
  ipm_winner: number;       // IPM >= this = winner
  ipm_watching: number;     // IPM >= this = watching
  min_spend: number;        // Minimum spend to evaluate
  min_installs: number;     // Minimum installs to evaluate
  min_views: number;        // Minimum views (impressions) to evaluate
}

export const PLA_DEFAULT_CONFIG: PLADecisionConfig = {
  ipm_winner: 15,
  ipm_watching: 13,
  min_spend: 5,
  min_installs: 3,
  min_views: 5000,
};

export function scorePLACreative(
  metrics: {
    ipm: number;
    spend: number;
    installs: number;
    views: number;
    clicks: number;
  },
  config: PLADecisionConfig = PLA_DEFAULT_CONFIG
): PLADecisionResult {
  const warnings: string[] = [];

  const ctr = metrics.views > 0 ? (metrics.clicks / metrics.views) * 100 : 0;
  const c2i = metrics.clicks > 0 ? (metrics.installs / metrics.clicks) * 100 : 0;

  if (ctr > 0 && ctr < 5) {
    warnings.push(`Low CTR (${ctr.toFixed(1)}%) — creative not attracting clicks`);
  }
  if (c2i > 0 && c2i < 2) {
    warnings.push(`Low CVR (${c2i.toFixed(1)}%) — store page mismatch?`);
  }

  const notEnoughData =
    metrics.spend < config.min_spend ||
    metrics.installs < config.min_installs ||
    metrics.views < config.min_views;

  if (notEnoughData) {
    const reasons: string[] = [];
    if (metrics.views < config.min_views)
      reasons.push(`${metrics.views.toLocaleString()}/${config.min_views.toLocaleString()} views`);
    if (metrics.installs < config.min_installs)
      reasons.push(`${metrics.installs}/${config.min_installs} installs`);
    if (metrics.spend < config.min_spend)
      reasons.push(`$${metrics.spend.toFixed(0)}/$${config.min_spend} spend`);
    return {
      decision: 'new',
      label: 'New',
      emoji: '🔵',
      hexColor: '#60a5fa',
      hexBg: 'rgba(59,130,246,0.12)',
      hexBorder: 'rgba(59,130,246,0.3)',
      reason: `Cần thêm data: ${reasons.join(', ')}`,
      warnings,
    };
  }

  const ipm = metrics.ipm;

  if (ipm >= config.ipm_winner) {
    return {
      decision: 'winner',
      label: 'Pass',
      emoji: '🏆',
      hexColor: '#34d399',
      hexBg: 'rgba(16,185,129,0.12)',
      hexBorder: 'rgba(16,185,129,0.35)',
      reason: `IPM ${ipm.toFixed(2)} ≥ ${config.ipm_winner} ✓`,
      warnings,
    };
  } else if (ipm >= config.ipm_watching) {
    return {
      decision: 'watching',
      label: 'Iterate',
      emoji: '⏳',
      hexColor: '#fbbf24',
      hexBg: 'rgba(245,158,11,0.12)',
      hexBorder: 'rgba(245,158,11,0.35)',
      reason: `IPM ${ipm.toFixed(2)} (${config.ipm_watching}–${config.ipm_winner} range)`,
      warnings,
    };
  } else {
    return {
      decision: 'fail',
      label: 'Fail',
      emoji: '❌',
      hexColor: '#f87171',
      hexBg: 'rgba(239,68,68,0.12)',
      hexBorder: 'rgba(239,68,68,0.35)',
      reason: `IPM ${ipm.toFixed(2)} < ${config.ipm_watching} threshold`,
      warnings,
    };
  }
}

export function getPLAIPMBarColor(ipm: number, config: PLADecisionConfig = PLA_DEFAULT_CONFIG): string {
  if (ipm >= config.ipm_winner) return '#10b981';
  if (ipm >= config.ipm_watching) return '#f59e0b';
  if (ipm > 0) return '#ef4444';
  return '#475569';
}

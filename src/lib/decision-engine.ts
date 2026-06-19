export type Decision = 'winner' | 'watching' | 'kill' | 'new';

export interface DecisionResult {
  decision: Decision;
  label: string;
  emoji: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  hexColor: string;
  hexBg: string;
  hexBorder: string;
  reason: string;
  warnings: string[];
}

export interface DecisionConfig {
  ipm_winner: number;
  ipm_watching: number;
  min_spend: number;
  min_installs: number;
  min_impressions: number;
  frequency_warning: number;
  hook_rate_warning: number;
}

export const DEFAULT_CONFIG: DecisionConfig = {
  ipm_winner: 7,
  ipm_watching: 6.5,
  min_spend: 10,
  min_installs: 5,
  min_impressions: 10000,
  frequency_warning: 3.5,
  hook_rate_warning: 15,
};

export function scoreCreative(
  metrics: {
    ipm: number;
    spend: number;
    installs: number;
    impressions: number;
    frequency: number;
    hook_rate: number;
    click_to_install: number;
  },
  config: DecisionConfig = DEFAULT_CONFIG
): DecisionResult {
  const warnings: string[] = [];

  if (metrics.frequency > config.frequency_warning) {
    warnings.push(`High frequency (${metrics.frequency.toFixed(1)}) — fatigue risk`);
  }
  if (metrics.hook_rate > 0 && metrics.hook_rate < config.hook_rate_warning) {
    warnings.push(`Low hook rate (${metrics.hook_rate.toFixed(1)}%) — 3s not engaging`);
  }
  if (metrics.click_to_install > 0 && metrics.click_to_install < 10) {
    warnings.push(`Low C2I (${metrics.click_to_install.toFixed(1)}%) — store page issue?`);
  }

  const notEnoughData =
    metrics.spend < config.min_spend ||
    metrics.installs < config.min_installs ||
    metrics.impressions < config.min_impressions;

  if (notEnoughData) {
    const reasons: string[] = [];
    if (metrics.impressions < config.min_impressions)
      reasons.push(`${metrics.impressions.toLocaleString()}/${config.min_impressions.toLocaleString()} impr`);
    if (metrics.installs < config.min_installs)
      reasons.push(`${metrics.installs}/${config.min_installs} installs`);
    if (metrics.spend < config.min_spend)
      reasons.push(`$${metrics.spend.toFixed(0)}/$${config.min_spend} spend`);
    return {
      decision: 'new',
      label: 'New',
      emoji: '🔵',
      colorClass: 'text-blue-400',
      bgClass: 'bg-blue-500/10',
      borderClass: 'border-blue-500/30',
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
      colorClass: 'text-emerald-400',
      bgClass: 'bg-emerald-500/10',
      borderClass: 'border-emerald-500/30',
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
      colorClass: 'text-amber-400',
      bgClass: 'bg-amber-500/10',
      borderClass: 'border-amber-500/30',
      hexColor: '#fbbf24',
      hexBg: 'rgba(245,158,11,0.12)',
      hexBorder: 'rgba(245,158,11,0.35)',
      reason: `IPM ${ipm.toFixed(2)} (${config.ipm_watching}–${config.ipm_winner} range)`,
      warnings,
    };
  } else {
    return {
      decision: 'kill',
      label: 'Fail',
      emoji: '❌',
      colorClass: 'text-red-400',
      bgClass: 'bg-red-500/10',
      borderClass: 'border-red-500/30',
      hexColor: '#f87171',
      hexBg: 'rgba(239,68,68,0.12)',
      hexBorder: 'rgba(239,68,68,0.35)',
      reason: `IPM ${ipm.toFixed(2)} < ${config.ipm_watching} threshold`,
      warnings,
    };
  }
}

export function getIPMBarColor(ipm: number, config: DecisionConfig = DEFAULT_CONFIG): string {
  if (ipm >= config.ipm_winner) return '#10b981';
  if (ipm >= config.ipm_watching) return '#f59e0b';
  if (ipm > 0) return '#ef4444';
  return '#475569';
}

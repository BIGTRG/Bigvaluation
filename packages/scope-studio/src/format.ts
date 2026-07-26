/**
 * {{BRAND_NAME}} — Scope-of-Work Studio
 * Text formatting for scope results — plain-text summaries for reports and CLI.
 */

import type { ScopeResult, ScopeLineItem } from './studio.ts';

/**
 * Format a single scope result as a readable text summary.
 */
export function formatScope(scope: ScopeResult): string {
  const lines: string[] = [];
  const tier = scope.tier.charAt(0).toUpperCase() + scope.tier.slice(1);
  lines.push(`=== ${tier} Rehab Scope ===`);
  lines.push(`Condition: ${scope.conditionScore}/5 | Sqft: ${scope.sqft.toLocaleString()} | Prep multiplier: ${scope.prepMultiplier.toFixed(2)}×`);
  lines.push('');

  // Group by kind
  const groups: Record<string, ScopeLineItem[]> = { finish: [], system: [], soft: [] };
  for (const li of scope.lineItems) {
    groups[li.kind].push(li);
  }

  if (groups.finish.length > 0) {
    lines.push('FINISH WORK:');
    for (const li of groups.finish) {
      lines.push(`  ${li.label.padEnd(28)} $${li.costUsd.toLocaleString().padStart(8)}`);
    }
    lines.push(`  ${''.padEnd(28)} ────────`);
    lines.push(`  ${'Subtotal'.padEnd(28)} $${scope.breakdown.finishUsd.toLocaleString().padStart(8)}`);
    lines.push('');
  }

  if (groups.system.length > 0) {
    lines.push('SYSTEM REPAIRS (condition-triggered):');
    for (const li of groups.system) {
      lines.push(`  ${li.label.padEnd(28)} $${li.costUsd.toLocaleString().padStart(8)}`);
    }
    lines.push(`  ${''.padEnd(28)} ────────`);
    lines.push(`  ${'Subtotal'.padEnd(28)} $${scope.breakdown.systemUsd.toLocaleString().padStart(8)}`);
    lines.push('');
  }

  if (groups.soft.length > 0) {
    lines.push('SOFT COSTS:');
    for (const li of groups.soft) {
      lines.push(`  ${li.label.padEnd(28)} $${li.costUsd.toLocaleString().padStart(8)}`);
    }
    lines.push(`  ${''.padEnd(28)} ────────`);
    lines.push(`  ${'Subtotal'.padEnd(28)} $${scope.breakdown.softUsd.toLocaleString().padStart(8)}`);
    lines.push('');
  }

  lines.push(`  ${'═══ TOTAL'.padEnd(28)} $${scope.totalUsd.toLocaleString().padStart(8)}`);
  lines.push(`  ${'($/sqft)'.padEnd(28)} $${(scope.totalUsd / scope.sqft).toFixed(2).padStart(8)}`);
  return lines.join('\n');
}

/**
 * Format all three tier scopes side-by-side as a comparison summary.
 */
export function formatComparison(scopes: Record<string, ScopeResult>): string {
  const tiers = ['light', 'medium', 'high'] as const;
  const lines: string[] = [];

  lines.push('╔══════════════════════════════════════════════════════════════╗');
  lines.push('║              SCOPE-OF-WORK COMPARISON                      ║');
  lines.push('╠══════════════════════════════════════════════════════════════╣');
  lines.push('');
  lines.push(`${'Category'.padEnd(18)} ${'Light'.padStart(10)} ${'Medium'.padStart(10)} ${'High'.padStart(10)}`);
  lines.push(`${'─'.repeat(18)} ${'─'.repeat(10)} ${'─'.repeat(10)} ${'─'.repeat(10)}`);

  lines.push(`${'Finish work'.padEnd(18)} ${fmt(scopes.light.breakdown.finishUsd)} ${fmt(scopes.medium.breakdown.finishUsd)} ${fmt(scopes.high.breakdown.finishUsd)}`);
  lines.push(`${'System repairs'.padEnd(18)} ${fmt(scopes.light.breakdown.systemUsd)} ${fmt(scopes.medium.breakdown.systemUsd)} ${fmt(scopes.high.breakdown.systemUsd)}`);
  lines.push(`${'Soft costs'.padEnd(18)} ${fmt(scopes.light.breakdown.softUsd)} ${fmt(scopes.medium.breakdown.softUsd)} ${fmt(scopes.high.breakdown.softUsd)}`);
  lines.push(`${'─'.repeat(18)} ${'─'.repeat(10)} ${'─'.repeat(10)} ${'─'.repeat(10)}`);
  lines.push(`${'TOTAL'.padEnd(18)} ${fmt(scopes.light.totalUsd)} ${fmt(scopes.medium.totalUsd)} ${fmt(scopes.high.totalUsd)}`);
  lines.push(`${'$/sqft'.padEnd(18)} ${fmtDec(scopes.light.totalUsd / scopes.light.sqft)} ${fmtDec(scopes.medium.totalUsd / scopes.medium.sqft)} ${fmtDec(scopes.high.totalUsd / scopes.high.sqft)}`);

  lines.push('');
  lines.push('╚══════════════════════════════════════════════════════════════╝');
  return lines.join('\n');
}

function fmt(n: number): string {
  return `$${n.toLocaleString()}`.padStart(10);
}

function fmtDec(n: number): string {
  return `$${n.toFixed(2)}`.padStart(10);
}

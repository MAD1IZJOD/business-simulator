// Forecasts and what-if analysis. Projections run the real engine on a deep
// copy of the state, so nothing touches the live company. Baseline and
// alternative runs share random seeds (common random numbers) so differences
// come from the decision, not from luck. Several seeds give a range.
import type { LoanKind, MarketingChannelId, RoleId, SimState } from './types';
import { seedRng } from './rng';
import { advanceMonths } from './step';
import { resolveDecision } from './systems/decisions';
import * as cmd from './commands';
import { issueEquity } from './systems/capital';
import { computeValuation } from './systems/valuation';
import { uid } from './util';

export type WhatIfAction =
  | { type: 'price'; pct: number; productId?: string }
  | { type: 'hire'; role: RoleId; count: number }
  | { type: 'layoff'; pct: number }
  | { type: 'enter_market'; marketId: string }
  | { type: 'marketing'; pct: number; channel?: MarketingChannelId }
  | { type: 'demand_shock'; pct: number }
  | { type: 'loan'; kind: LoanKind; amount: number }
  | { type: 'equity'; amount: number };

export interface ProjectionPoint {
  month: number;
  revenue: number;
  netIncome: number;
  cash: number;
  customers: number;
  valuation: number;
  employees: number;
  marketShare: number;
}

export interface ProjectionRun {
  points: ProjectionPoint[];
  failed: boolean;
  minCash: number;
}

export interface Band {
  p10: number[];
  p50: number[];
  p90: number[];
}

export interface ProjectionSummary {
  months: number;
  runs: number;
  series: Record<keyof Omit<ProjectionPoint, 'month'>, Band>;
  failureProbability: number;
  negativeCashProbability: number;
  totals: { revenue: number; netIncome: number; endCash: number; endCustomers: number; endValuation: number };
}

export function cloneState(s: SimState): SimState {
  return structuredClone(s);
}

/** Apply a what-if action to a (cloned) state using real commands. */
export function applyAction(s: SimState, a: WhatIfAction): string {
  switch (a.type) {
    case 'price': {
      const targets = s.products.filter((p) => p.stage === 'launched' && (!a.productId || p.id === a.productId));
      for (const p of targets) cmd.setPrice(s, p.id, p.price * (1 + a.pct / 100));
      return `Price ${a.pct >= 0 ? '+' : ''}${a.pct}%`;
    }
    case 'hire': {
      // Projections assume the hires happen (hiring takes time in the real game).
      cmd.openJob(s, { role: a.role, level: 2, count: a.count, autoHire: true, minSkill: 0 });
      return `Hire ${a.count} ${a.role.replace('_', ' ')}`;
    }
    case 'layoff':
      cmd.layoff(s, null, Math.round(s.employees.length * (a.pct / 100)));
      return `Lay off ${a.pct}%`;
    case 'enter_market':
      return cmd.enterMarket(s, a.marketId).message;
    case 'marketing': {
      for (const ch of Object.keys(s.marketing.budgets) as MarketingChannelId[]) {
        if (a.channel && ch !== a.channel) continue;
        const b = s.marketing.budgets[ch];
        if (b > 0 || a.channel) s.marketing.budgets[ch] = Math.max(0, (b || 100000) * (1 + a.pct / 100));
      }
      return `Marketing ${a.pct >= 0 ? '+' : ''}${a.pct}%`;
    }
    case 'demand_shock':
      s.modifiers.push({ id: uid(s, 'm'), target: 'demand', value: 1 + a.pct / 100, scope: null, startDay: s.day, endDay: s.day + 365 * 5, source: 'What-if demand shock' });
      return `Demand ${a.pct >= 0 ? '+' : ''}${a.pct}%`;
    case 'loan':
      return cmd.takeLoan(s, a.kind, a.amount).message;
    case 'equity': {
      const pre = computeValuation(s).value;
      issueEquity(s, 'Hypothetical investor', a.amount, pre, 'What-if');
      return `Raise ₹${a.amount.toLocaleString('en-IN')} at current valuation`;
    }
  }
}

/** Run one projection. Open decisions resolve to their defaults. */
export function runProjection(base: SimState, months: number, actions: WhatIfAction[], seedOffset: number): ProjectionRun {
  const s = cloneState(base);
  s.flags.projection = true;
  s.config = { ...s.config, tutorial: false };
  if (seedOffset > 0) s.rng = seedRng((base.seed * 31 + base.day * 7919 + seedOffset * 104729) >>> 0);
  for (const a of actions) applyAction(s, a);
  const points: ProjectionPoint[] = [];
  let minCash = s.finance.cash;
  const startReports = s.reports.length;
  for (let m = 0; m < months && s.status === 'running'; m++) {
    for (const d of s.decisions) if (!d.resolved) resolveDecision(s, d.id, d.defaultOption);
    advanceMonths(s, 1);
    const r = s.reports[s.reports.length - 1];
    if (!r || s.reports.length === startReports) break;
    minCash = Math.min(minCash, r.kpis.cash);
    points.push({ month: m + 1, revenue: r.kpis.revenue, netIncome: r.kpis.netIncome, cash: r.kpis.cash, customers: r.kpis.customers, valuation: r.kpis.valuation, employees: r.kpis.employees, marketShare: r.kpis.marketShare });
  }
  return { points, failed: s.status === 'ended' && s.outcome?.kind !== 'scenario_win' && s.outcome?.kind !== 'acquired' && s.outcome?.kind !== 'private_sale', minCash };
}

function percentile(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[idx];
}

export function summarize(runs: ProjectionRun[], months: number): ProjectionSummary {
  const keys: (keyof Omit<ProjectionPoint, 'month'>)[] = ['revenue', 'netIncome', 'cash', 'customers', 'valuation', 'employees', 'marketShare'];
  const series = {} as ProjectionSummary['series'];
  for (const k of keys) {
    const band: Band = { p10: [], p50: [], p90: [] };
    for (let m = 0; m < months; m++) {
      // A failed run carries its last value forward (cash stays where it died).
      const vals = runs.map((r) => (r.points[m] ?? r.points[r.points.length - 1])?.[k] ?? 0);
      band.p10.push(percentile(vals, 0.1));
      band.p50.push(percentile(vals, 0.5));
      band.p90.push(percentile(vals, 0.9));
    }
    series[k] = band;
  }
  const med = (f: (r: ProjectionRun) => number) => percentile(runs.map(f), 0.5);
  return {
    months,
    runs: runs.length,
    series,
    failureProbability: runs.filter((r) => r.failed).length / runs.length,
    negativeCashProbability: runs.filter((r) => r.minCash < 0).length / runs.length,
    totals: {
      revenue: med((r) => r.points.reduce((a, p) => a + p.revenue, 0)),
      netIncome: med((r) => r.points.reduce((a, p) => a + p.netIncome, 0)),
      endCash: med((r) => r.points[r.points.length - 1]?.cash ?? 0),
      endCustomers: med((r) => r.points[r.points.length - 1]?.customers ?? 0),
      endValuation: med((r) => r.points[r.points.length - 1]?.valuation ?? 0),
    },
  };
}

export function forecast(base: SimState, months = 12, runs = 5): ProjectionSummary {
  const out: ProjectionRun[] = [];
  for (let k = 1; k <= runs; k++) out.push(runProjection(base, months, [], k));
  return summarize(out, months);
}

export interface Comparison {
  baseline: ProjectionSummary;
  alternative: ProjectionSummary;
  actionsA: WhatIfAction[];
  actionsB: WhatIfAction[];
}

/** Compare two plans (each a list of actions) over the same random futures. */
export function comparePlans(base: SimState, planA: WhatIfAction[], planB: WhatIfAction[], months = 12, runs = 5): Comparison {
  const a: ProjectionRun[] = [];
  const b: ProjectionRun[] = [];
  for (let k = 1; k <= runs; k++) {
    a.push(runProjection(base, months, planA, k));
    b.push(runProjection(base, months, planB, k));
  }
  return { baseline: summarize(a, months), alternative: summarize(b, months), actionsA: planA, actionsB: planB };
}

export function whatIf(base: SimState, actions: WhatIfAction[], months = 12, runs = 5): Comparison {
  return comparePlans(base, [], actions, months, runs);
}

import { describe, expect, it } from 'vitest';
import { launchedGame } from './helpers';
import { advanceMonths, advanceDays } from '../src/engine/step';
import * as cmd from '../src/engine/commands';
import { validateState } from '../src/engine/validate';
import { balanceGap } from '../src/engine/systems/ledger';
import { roundEligibility } from '../src/engine/systems/capital';

/** A simple "reasonable founder" policy used to exercise late-game systems. */
function playMonth(s: ReturnType<typeof launchedGame>): void {
  for (const d of s.decisions) if (!d.resolved) cmd.decide(s, d.id, d.kind === 'enterprise_contract' || d.kind === 'partnership' ? d.options[0].id : d.defaultOption);
  const r = s.reports[s.reports.length - 1];
  if (!r) return;
  // Grow the team with revenue.
  const open = s.openings.reduce((a, j) => a + j.count - j.filled, 0);
  if (open === 0 && r.kpis.runwayMonths > 9 && s.employees.length < 60) {
    cmd.openJob(s, { role: s.employees.filter((e) => e.role === 'engineer').length < 6 ? 'engineer' : 'account_executive', level: 2, count: 2 });
    cmd.openJob(s, { role: 'support_agent', level: 1, count: 1 });
  }
  // Scale marketing with cash.
  const budget = Math.max(100000, Math.min(5000000, s.finance.cash * 0.04));
  cmd.setMarketingBudget(s, 'paid_search', budget * 0.5);
  cmd.setMarketingBudget(s, 'social', budget * 0.3);
  cmd.setMarketingBudget(s, 'content', budget * 0.2);
  // Raise money when runway gets short.
  if (!s.raise && r.kpis.runwayMonths < 10) {
    const el = roundEligibility(s).filter((e) => e.eligible && e.kind !== 'friends_family');
    if (el.length) cmd.startRaise(s, el[el.length - 1].kind);
  }
  if (s.raise) for (const t of s.raise.termSheets) if (t.status === 'open') { cmd.acceptTermSheet(s, t.id); break; }
  if (s.reports.length === 18) cmd.enterMarket(s, 'mum');
  if (s.reports.length === 30) cmd.startTechUpgrade(s, 'analytics');
}

describe('long run', () => {
  it('stays valid and balanced over ten years of active play', () => {
    const s = launchedGame({ industry: 'saas', startingCapital: 30000000, seed: 777 });
    const t0 = Date.now();
    for (let m = 0; m < 120 && s.status === 'running'; m++) {
      playMonth(s);
      // Check fundraising within the month too.
      advanceDays(s, 10);
      if (s.raise) for (const t of s.raise.termSheets) if (t.status === 'open') { cmd.acceptTermSheet(s, t.id); break; }
      advanceMonths(s, 1);
      if (m % 12 === 11) {
        expect(validateState(s, false)).toEqual([]);
        expect(Math.abs(balanceGap(s))).toBeLessThan(5);
      }
    }
    const ms = Date.now() - t0;
    expect(ms).toBeLessThan(60000);
    expect(s.reports.length).toBeGreaterThan(24);
    const last = s.reports[s.reports.length - 1];
    for (const v of Object.values(last.kpis)) expect(Number.isNaN(v)).toBe(false);
  }, 120000);
});

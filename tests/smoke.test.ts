import { describe, it, expect } from 'vitest';
import { createGame, defaultConfig } from '../src/engine/create';
import { advanceMonths } from '../src/engine/step';
import { resolveDecision } from '../src/engine/systems/decisions';
import { balanceGap } from '../src/engine/systems/ledger';
import { openJob } from '../src/engine/systems/hiring';
import type { Monetization } from '../src/engine/types';

describe('smoke', () => {
  for (const industry of ['saas', 'electronics', 'restaurants', 'consulting', 'ecommerce', 'fintech', 'media'] as const) {
    it(`runs ${industry}`, () => {
      const s = createGame(defaultConfig({ industry, startingCapital: 10000000, monetization: (({ saas: 'subscription', consulting: 'enterprise', fintech: 'transaction_fee', media: 'advertising' } as Record<string, Monetization>)[industry] ?? 'one_time'), audience: industry === 'saas' || industry === 'consulting' ? 'b2b' : 'b2c', targetSegment: industry === 'saas' ? 'smb' : industry === 'consulting' ? 'enterprise' : 'consumers' }));
      const d = s.decisions.find((x) => x.kind === 'launch_strategy')!;
      resolveDecision(s, d.id, 'balanced');
      openJob(s, { role: 'marketer', level: 2, count: 1 });
      openJob(s, { role: industry === 'consulting' || industry === 'restaurants' ? 'specialist' : 'support_agent', level: 2, count: 2 });
      if (industry === 'consulting') openJob(s, { role: 'account_executive', level: 2, count: 1 });
      const t0 = Date.now();
      advanceMonths(s, 24);
      const ms = Date.now() - t0;
      const rows = s.reports.filter((_, i) => i % 3 === 2).map((r) => `${r.year}-${r.month} rev ${Math.round(r.kpis.revenue)} cust ${r.kpis.customers.toFixed(1)} cash ${Math.round(r.kpis.cash)} ni ${Math.round(r.kpis.netIncome)} cac ${Math.round(r.kpis.cac)} ltv ${Math.round(r.kpis.ltv)} churn ${(r.kpis.churnRate*100).toFixed(1)} share ${(r.kpis.marketShare*100).toFixed(2)} emp ${r.kpis.employees} sat ${r.kpis.satisfaction.toFixed(0)}`);
      const last = s.reports[s.reports.length - 1];
      console.log(industry, ms + 'ms', s.status, s.outcome?.title ?? '', '\n' + rows.join('\n'), '\nchurn drivers', JSON.stringify(last.drivers.churn.map((x) => [x.label, +x.value.toFixed(2)])), '\nsignals', JSON.stringify(last.drivers.signals.map((x) => [x.label, +x.value.toFixed(3)])));
      expect(Math.abs(balanceGap(s))).toBeLessThan(1);
    });
  }
});

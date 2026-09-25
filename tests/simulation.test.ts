import { describe, expect, it } from 'vitest';
import { launchedGame } from './helpers';
import { createGame, defaultConfig } from '../src/engine/create';
import { advanceDays, advanceMonths } from '../src/engine/step';
import { balanceGap } from '../src/engine/systems/ledger';
import * as cmd from '../src/engine/commands';
import { churnRate, revenuePerUnitOfActivity } from '../src/engine/systems/market';
import { ourUtility, priceElasticity, priceTerm, sumUtility } from '../src/engine/systems/pricing';
import { addFinished, emptyInventory, takeFinished } from '../src/engine/systems/inventory';
import { issueEquity } from '../src/engine/systems/capital';
import { founderOwnership, totalShares } from '../src/engine/context';
import { EVENT_BY_ID } from '../src/engine/data/events';
import { fireEvent } from '../src/engine/systems/events';
import { INDUSTRY_LIST } from '../src/engine/data/industries';
import { validateState } from '../src/engine/validate';
import { whatIf, cloneState } from '../src/engine/projection';
import { explain } from '../src/engine/explain';
import { getCell } from '../src/engine/systems/customers';

describe('pricing and demand', () => {
  it('price term falls as price rises, and budget buyers are more sensitive than enterprises', () => {
    expect(priceTerm('consumers', 120, 100, 50, 'recurring')).toBeLessThan(priceTerm('consumers', 100, 100, 50, 'recurring'));
    const budgetDrop = priceTerm('budget', 100, 100, 50, 'recurring') - priceTerm('budget', 150, 100, 50, 'recurring');
    const entDrop = priceTerm('enterprise', 100, 100, 50, 'recurring') - priceTerm('enterprise', 150, 100, 50, 'recurring');
    expect(budgetDrop).toBeGreaterThan(entDrop * 3);
    expect(priceElasticity('budget', 50, 0.1)).toBeLessThan(priceElasticity('enterprise', 50, 0.1));
    // Brand gives pricing power.
    const weak = priceTerm('consumers', 150, 100, 10, 'recurring');
    const strong = priceTerm('consumers', 150, 100, 90, 'recurring');
    expect(strong).toBeGreaterThan(weak);
  });

  it('a higher price lowers product utility; better quality raises it', () => {
    const s = launchedGame();
    const p = s.products[0];
    const base = sumUtility(ourUtility(s, p, s.config.hqMarket, 'smb'));
    p.price *= 1.5;
    expect(sumUtility(ourUtility(s, p, s.config.hqMarket, 'smb'))).toBeLessThan(base);
    p.price /= 1.5;
    p.quality += 20;
    expect(sumUtility(ourUtility(s, p, s.config.hqMarket, 'smb'))).toBeGreaterThan(base);
  });

  it('doubling the price reduces new customers but raises revenue per customer', () => {
    const a = launchedGame({ seed: 7 });
    const b = cloneState(a);
    cmd.setPrice(b, b.products[0].id, b.products[0].price * 2);
    advanceMonths(a, 6);
    advanceMonths(b, 6);
    const newA = a.reports.reduce((x, r) => x + r.kpis.newCustomers, 0);
    const newB = b.reports.reduce((x, r) => x + r.kpis.newCustomers, 0);
    expect(newB).toBeLessThan(newA);
    const arpuA = a.reports[5].kpis.arpu;
    const arpuB = b.reports[5].kpis.arpu;
    expect(arpuB).toBeGreaterThan(arpuA);
  });

  it('marketing spend increases awareness and customers', () => {
    const a = launchedGame({ seed: 11 }, 'soft');
    const b = cloneState(a);
    cmd.setMarketingBudget(b, 'paid_search', 500000);
    cmd.setMarketingBudget(b, 'social', 500000);
    advanceMonths(a, 4);
    advanceMonths(b, 4);
    expect(b.reports[3].drivers.signals.find((x) => x.label === 'Average awareness')!.value).toBeGreaterThan(a.reports[3].drivers.signals.find((x) => x.label === 'Average awareness')!.value);
    expect(b.reports[3].kpis.customers).toBeGreaterThan(a.reports[3].kpis.customers);
  });

  it('computes subscription revenue per customer from price, seats and expansion', () => {
    const s = launchedGame({ industry: 'saas' });
    const p = s.products[0];
    const perSmb = revenuePerUnitOfActivity(s, p, s.config.hqMarket, 'smb', 1);
    const mult = s.markets.find((m) => m.id === s.config.hqMarket)!.priceMult;
    expect(perSmb).toBeCloseTo(p.price * mult * 8, 4); // 8 seats per SMB, direct channel
    expect(revenuePerUnitOfActivity(s, p, s.config.hqMarket, 'smb', 1.5)).toBeCloseTo(perSmb * 1.5, 4);
  });
});

describe('customers and churn', () => {
  it('low satisfaction raises churn', () => {
    const s = launchedGame();
    const p = s.products[0];
    const cell = getCell(s, p.id, s.config.hqMarket, 'smb');
    cell.customers = 100;
    p.satisfaction = 80;
    const happy = churnRate(s, p, cell, 0).rate;
    p.satisfaction = 25;
    const unhappy = churnRate(s, p, cell, 0).rate;
    expect(unhappy).toBeGreaterThan(happy * 2);
  });

  it('reports consistent CAC, ARPU and LTV', () => {
    const s = launchedGame({ industry: 'saas' });
    advanceMonths(s, 8);
    const r = s.reports[7];
    const spend = r.kpis.marketingSpend + (r.breakdown.salaryByDept.sales ?? 0) + (r.breakdown.salaryByDept.marketing ?? 0);
    if (r.kpis.newCustomers > 0.5) expect(r.kpis.cac).toBeCloseTo(spend / r.kpis.newCustomers, 4);
    if (r.kpis.churnRate > 0.0005) expect(r.kpis.ltv).toBeCloseTo((r.kpis.arpu * Math.max(0, r.kpis.grossMargin)) / r.kpis.churnRate, 2);
    expect(r.kpis.marketShare).toBeGreaterThanOrEqual(0);
    expect(r.kpis.marketShare).toBeLessThanOrEqual(1);
  });

  it('customer counts change by new minus churned', () => {
    const s = launchedGame({ industry: 'saas' });
    advanceMonths(s, 6);
    for (let i = 1; i < s.reports.length; i++) {
      const r = s.reports[i];
      const prev = s.reports[i - 1];
      expect(r.kpis.customers).toBeCloseTo(prev.kpis.customers + r.kpis.newCustomers - r.kpis.churned, 4);
    }
  });
});

describe('inventory', () => {
  it('uses weighted-average cost and never goes negative', () => {
    const inv = emptyInventory('x');
    addFinished(inv, 100, 1000);
    addFinished(inv, 100, 3000);
    const [n, cost] = takeFinished(inv, 50);
    expect(n).toBe(50);
    expect(cost).toBeCloseTo(1000);
    const [n2] = takeFinished(inv, 1000);
    expect(n2).toBe(150);
    expect(inv.finished).toBe(0);
    expect(inv.finishedValue).toBe(0);
  });

  it('physical businesses sell only what is in stock and record lost sales', () => {
    const s = launchedGame({ industry: 'electronics', audience: 'b2c', targetSegment: 'consumers', monetization: 'one_time', startingCapital: 20000000 });
    const inv = s.inventory[s.products[0].id];
    inv.autoReorder = false;
    cmd.setMarketingBudget(s, 'social', 800000);
    advanceMonths(s, 2);
    expect(inv.finished).toBeGreaterThanOrEqual(0);
    const r = s.reports[1];
    expect(r.kpis.units).toBe(0);
    expect(r.kpis.lostUnits).toBeGreaterThan(0);
  });

  it('deliveries create inventory and supplier payables', () => {
    const s = launchedGame({ industry: 'ecommerce', audience: 'b2c', targetSegment: 'consumers', monetization: 'one_time' });
    const p = s.products[0];
    const sup = s.suppliers[2];
    const res = cmd.placeOrder(s, p.id, sup.id, 1000);
    expect(res.ok).toBe(true);
    advanceDays(s, sup.leadTimeDays + 20);
    const inv = s.inventory[p.id];
    expect(inv.finished + s.reports.reduce((a, r) => a + r.kpis.units, 0) + s.month.units).toBeGreaterThan(0);
    expect(Math.abs(balanceGap(s))).toBeLessThan(1);
  });
});

describe('fundraising and the cap table', () => {
  it('issues shares at the pre-money price and dilutes the founder', () => {
    const s = launchedGame();
    const before = totalShares(s);
    const { price, newShares } = issueEquity(s, 'Test VC', 25000000, 100000000, 'Seed');
    expect(price).toBeCloseTo(100000000 / before, 6);
    expect(newShares).toBe(Math.round(25000000 / price));
    expect(founderOwnership(s)).toBeCloseTo(0.8, 3); // 100 pre + 25 new = 20% dilution
    expect(Math.abs(balanceGap(s))).toBeLessThan(1);
  });

  it('creates an option pool pre-money so it dilutes existing holders, not the investor', () => {
    const s = launchedGame();
    issueEquity(s, 'Test VC', 20000000, 80000000, 'Seed', 0.1);
    const t = totalShares(s);
    const pool = s.capTable.find((h) => h.kind === 'option_pool')!;
    const inv = s.capTable.find((h) => h.name === 'Test VC')!;
    expect(pool.shares / t).toBeCloseTo(0.1, 2);
    expect(inv.shares / t).toBeCloseTo(0.2, 2);
  });

  it('runs a round end-to-end through term sheets', () => {
    const s = launchedGame();
    expect(cmd.startRaise(s, 'angel').ok).toBe(true);
    let ts = null;
    for (let i = 0; i < 60 && !ts; i++) {
      advanceDays(s, 1);
      ts = s.raise?.termSheets.find((t) => t.status === 'open') ?? null;
    }
    if (ts) {
      const cash = s.finance.cash;
      const r = cmd.acceptTermSheet(s, ts.id);
      expect(r.ok).toBe(true);
      expect(s.finance.cash).toBeGreaterThan(cash);
      expect(s.rounds.length).toBe(1);
      expect(founderOwnership(s)).toBeLessThan(1);
    }
  });
});

describe('events', () => {
  it('fires events with recorded, concrete effects', () => {
    const s = launchedGame();
    advanceMonths(s, 2);
    const brand = s.company.brand;
    const rec = fireEvent(s, EVENT_BY_ID.positive_review);
    expect(s.events[0].id).toBe(rec.id);
    expect(rec.effects.length).toBeGreaterThan(0);
    expect(s.company.brand).toBeGreaterThan(brand);
    expect(s.modifiers.some((m) => m.target === 'conversion')).toBe(true);
    expect(s.news.some((n) => n.headline === rec.title)).toBe(true);
  });

  it('legal events create a decision; settling costs money', () => {
    const s = launchedGame();
    advanceMonths(s, 2);
    fireEvent(s, EVENT_BY_ID.patent_troll);
    const d = s.decisions.find((x) => x.kind === 'legal_case' && !x.resolved)!;
    expect(d).toBeTruthy();
    const legal = s.month.opex.legal;
    cmd.decide(s, d.id, 'settle');
    expect(s.month.opex.legal).toBeGreaterThan(legal);
  });
});

describe('determinism and progression', () => {
  it('same seed and decisions reproduce the same simulation', () => {
    const a = launchedGame({ seed: 4242 });
    const b = launchedGame({ seed: 4242 });
    advanceMonths(a, 10);
    advanceMonths(b, 10);
    a.runId = b.runId = 'x';
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('different seeds diverge', () => {
    const a = launchedGame({ seed: 1 });
    const b = launchedGame({ seed: 2 });
    advanceMonths(a, 6);
    advanceMonths(b, 6);
    expect(a.reports[5].kpis.revenue).not.toBe(b.reports[5].kpis.revenue);
  });

  it('advances the clock and files one report per month', () => {
    const s = launchedGame();
    advanceDays(s, 31);
    expect(s.day).toBe(31);
    expect(s.reports.length).toBe(1);
    advanceMonths(s, 11);
    expect(s.reports.length).toBe(12);
    expect(s.reports[11].month).toBe(12);
    expect(s.reports[11].year).toBe(2027);
  });

  it('every industry runs 12 months without invalid state', () => {
    for (const ind of INDUSTRY_LIST) {
      const s = createGame(defaultConfig({ industry: ind.id, monetization: ind.defaultMonetization, tutorial: false, startingCapital: 20000000 }));
      const d = s.decisions.find((x) => x.kind === 'launch_strategy');
      if (d) cmd.decide(s, d.id, 'balanced');
      advanceMonths(s, 12);
      const issues = validateState(s, false);
      expect(issues, `${ind.id}: ${JSON.stringify(issues.slice(0, 3))}`).toEqual([]);
    }
  }, 60000);

  it('companies can fail with an explanation', () => {
    const s = launchedGame({ startingCapital: 200000, difficulty: 'brutal' });
    cmd.openJob(s, { role: 'engineer', level: 4, count: 6, autoHire: true, minSkill: 0 });
    cmd.setMarketingBudget(s, 'tv', 3000000);
    advanceMonths(s, 12);
    expect(s.status).toBe('ended');
    expect(s.outcome?.kind).toBe('failure');
    expect(s.outcome?.factors.length).toBeGreaterThan(0);
  });
});

describe('what-if analysis and explainability', () => {
  it('projects alternatives without touching the live company', () => {
    const s = launchedGame({ industry: 'saas' });
    advanceMonths(s, 3);
    const snapshot = JSON.stringify(s);
    const cmp = whatIf(s, [{ type: 'marketing', pct: 200, channel: 'paid_search' }], 6, 3);
    expect(JSON.stringify(s)).toBe(snapshot);
    expect(cmp.baseline.series.revenue.p50.length).toBe(6);
    expect(cmp.alternative.totals.endCustomers).toBeGreaterThan(cmp.baseline.totals.endCustomers);
  });

  it('a demand shock lowers projected revenue', () => {
    const s = launchedGame({ industry: 'saas' });
    advanceMonths(s, 4);
    const cmp = whatIf(s, [{ type: 'demand_shock', pct: -50 }], 6, 2);
    expect(cmp.alternative.totals.revenue).toBeLessThan(cmp.baseline.totals.revenue);
  });

  it('profit explanation factors sum exactly to the change', () => {
    const s = launchedGame();
    advanceMonths(s, 5);
    const e = explain(s, 'profit')!;
    const sum = e.factors.reduce((a, f) => a + f.impact, 0);
    expect(sum).toBeCloseTo(e.to - (e.from ?? 0), 0);
    const rev = explain(s, 'revenue')!;
    expect(rev.factors.reduce((a, f) => a + f.impact, 0)).toBeCloseTo(rev.to - (rev.from ?? 0), 0);
    const cash = explain(s, 'cash')!;
    expect(cash.factors.reduce((a, f) => a + f.impact, 0)).toBeCloseTo(cash.to - (cash.from ?? 0), 0);
  });

  it('validation repairs NaN values', () => {
    const s = launchedGame();
    s.company.brand = Number.NaN;
    const issues = validateState(s, true);
    expect(issues.some((i) => i.path.endsWith('brand'))).toBe(true);
    expect(s.company.brand).toBe(0);
  });
});

// Scenario definitions: starting conditions that reshape a new game, plus an
// objective that is checked every month.
import type { Difficulty, IndustryId, RoleId, SegmentId, SimState } from '../types';
import { segmentsFor } from '../context';
import { clamp, msKey } from '../util';
import { createEmployee } from './employees';
import { getCell } from './customers';
import { launchProduct } from './products';
import { startRecession } from './macro';
import { addNews } from './news';
import { computeValuation } from './valuation';
import { segmentPotential } from './market';

export interface ScenarioDef {
  id: string;
  name: string;
  tagline: string;
  description: string;
  industry: IndustryId | null; // suggested industry (player may change unless locked)
  lockIndustry: boolean;
  startingCapital: number;
  difficulty: Difficulty | null;
  objective: string;
  deadlineMonths: number | null;
}

export const SCENARIOS: ScenarioDef[] = [
  { id: 'startup', name: 'The Startup', tagline: 'Build a company from ₹10 lakh.', description: 'Just you, one early employee and ₹10 lakh. Reach a ₹1 crore annual revenue run-rate within three years without running out of money.', industry: null, lockIndustry: false, startingCapital: 1000000, difficulty: null, objective: 'Reach ₹1 Cr annual revenue run-rate', deadlineMonths: 36 },
  { id: 'hypergrowth', name: 'Hypergrowth', tagline: 'Reach ₹100 crore revenue.', description: 'You have ₹5 crore and a hot market. Reach ₹100 crore in annual revenue run-rate within five years.', industry: 'saas', lockIndustry: false, startingCapital: 50000000, difficulty: null, objective: 'Reach ₹100 Cr annual revenue run-rate', deadlineMonths: 60 },
  { id: 'turnaround', name: 'Turnaround', tagline: 'Save a failing company.', description: 'You take over a company burning cash with a big bank loan, a demoralised team and a shrinking customer base. Deliver three consecutive profitable months within two years.', industry: 'ecommerce', lockIndustry: false, startingCapital: 3000000, difficulty: null, objective: 'Three consecutive profitable months', deadlineMonths: 24 },
  { id: 'recession', name: 'Recession', tagline: 'Survive a major downturn.', description: 'A severe recession hits in your first month. Stay solvent for two years.', industry: null, lockIndustry: false, startingCapital: 10000000, difficulty: null, objective: 'Stay solvent for 24 months', deadlineMonths: 24 },
  { id: 'price_war', name: 'Price War', tagline: 'Compete against an aggressive competitor.', description: 'A heavily funded rival is about to slash prices. Hold at least 15% market share after two years.', industry: 'ecommerce', lockIndustry: false, startingCapital: 20000000, difficulty: null, objective: 'Hold 15% market share at month 24', deadlineMonths: 24 },
  { id: 'supply_crisis', name: 'Supply Crisis', tagline: 'Survive a major supply disruption.', description: 'Your main supplier is about to collapse amid a global materials shortage. Keep fulfilling 90% of demand and stay solvent for 18 months.', industry: 'electronics', lockIndustry: true, startingCapital: 30000000, difficulty: null, objective: 'Solvent at month 18 with ≥90% fulfillment', deadlineMonths: 18 },
  { id: 'ipo', name: 'IPO', tagline: 'Take a company public.', description: 'You run a scaling Series B company. Take it public within five years.', industry: 'saas', lockIndustry: false, startingCapital: 400000000, difficulty: null, objective: 'Complete an IPO', deadlineMonths: 60 },
  { id: 'monopoly', name: 'Monopoly', tagline: 'Become the dominant market player.', description: 'Reach 50% market share in your industry within six years.', industry: null, lockIndustry: false, startingCapital: 50000000, difficulty: null, objective: 'Reach 50% market share', deadlineMonths: 72 },
];

export const SCENARIO_BY_ID: Record<string, ScenarioDef> = Object.fromEntries(SCENARIOS.map((x) => [x.id, x]));

/** Seed an existing business: launched product, customers at a target monthly revenue, and a team. */
function seedExistingBusiness(s: SimState, opts: { customersShare: number; team: Partial<Record<RoleId, number>>; brand: number; morale: number }): void {
  const p = s.products[0];
  launchProduct(s, p, 'soft');
  s.decisions = s.decisions.filter((d) => d.kind !== 'launch_strategy');
  p.launchDay = -365;
  p.phase = 'maturity';
  p.satisfaction = 55;
  for (const seg of segmentsFor(s)) {
    const pot = segmentPotential(s, s.config.hqMarket, seg);
    getCell(s, p.id, s.config.hqMarket, seg as SegmentId).customers = pot * opts.customersShare;
    s.company.awareness[msKey(s.config.hqMarket, seg)] = 0.12;
  }
  for (const [role, n] of Object.entries(opts.team)) {
    for (let i = 0; i < (n ?? 0); i++) {
      const e = createEmployee(s, role as RoleId, 2 + (i % 4 === 0 ? 1 : 0), s.config.hqMarket, { startProductive: true });
      e.morale = opts.morale;
      s.employees.push(e);
    }
  }
  s.company.brand = opts.brand;
  const office = s.facilities.find((f) => f.kind === 'office');
  if (office) office.capacity = Math.max(office.capacity, s.employees.length);
}

export function applyScenarioSetup(s: SimState): void {
  const id = s.config.scenarioId;
  if (!id) return;
  const def = SCENARIO_BY_ID[id];
  if (!def) return;
  s.scenario = { id, objectiveText: def.objective, deadlineDay: def.deadlineMonths ? Math.round(def.deadlineMonths * 30.44) : null, progress: 0, complete: false, failed: false };
  switch (id) {
    case 'turnaround': {
      seedExistingBusiness(s, { customersShare: 0.004, team: { engineer: 3, marketer: 2, support_agent: 4, ops_associate: 6, sdr: 2, finance_analyst: 1, product_manager: 1 }, brand: 38, morale: 38 });
      s.marketing.budgets.paid_search = 400000;
      s.marketing.budgets.social = 300000;
      s.loans.push({ id: 'l-turnaround', kind: 'bank', lender: 'Sahyadri Bank', principal: 20000000, balance: 20000000, limit: 0, rate: 13, termMonths: 36, monthsRemaining: 36, monthlyPayment: (20000000 * 13 / 1200) / (1 - Math.pow(1 + 13 / 1200, -36)), startDay: -30, missedPayments: 0, covenants: [], status: 'active' });
      // The loan funded past losses, so the balance sheet starts with an accumulated deficit.
      s.finance.retainedEarnings -= 20000000;
      s.company.reputation.employer = 40;
      addNews(s, `New CEO takes over struggling ${s.company.name}`, 'The company is losing money every month and owes ₹2 Cr to its bank.', 'company', 'negative');
      break;
    }
    case 'recession':
      startRecession(s, 'demand', 0.9, 14);
      break;
    case 'price_war': {
      seedExistingBusiness(s, { customersShare: 0.01, team: { engineer: 2, marketer: 2, support_agent: 3, ops_associate: 4 }, brand: 45, morale: 65 });
      const rival = s.competitors[0];
      if (rival) {
        rival.strategy = 'aggressive_growth';
        rival.cash += 500000000;
      }
      break;
    }
    case 'supply_crisis': {
      seedExistingBusiness(s, { customersShare: 0.004, team: { engineer: 2, ops_associate: 6, marketer: 1, support_agent: 2 }, brand: 45, morale: 65 });
      const main = s.suppliers[1];
      if (main) {
        main.risk = 0.9;
        s.flags.scriptedBankruptcy = main.id;
      }
      s.modifiers.push({ id: 'm-shortage', target: 'material_cost', value: 1.35, scope: null, startDay: 30, endDay: 240, source: 'Global chip shortage' });
      s.modifiers.push({ id: 'm-shortage-cap', target: 'supplier_capacity', value: 0.55, scope: null, startDay: 30, endDay: 210, source: 'Global chip shortage' });
      break;
    }
    case 'ipo': {
      seedExistingBusiness(s, { customersShare: 0.03, team: { engineer: 40, product_manager: 6, designer: 4, sdr: 10, account_executive: 10, account_manager: 4, marketer: 8, finance_analyst: 3, recruiter: 3, support_agent: 15, cs_manager: 5, lawyer: 1, security_engineer: 2 }, brand: 60, morale: 70 });
      // Earlier rounds: founders diluted to ~40%.
      s.capTable.push({ id: 'sh-seed', name: 'Lotus Seed Fund', kind: 'investor', shares: 3000000, invested: 60000000, round: 'Seed', investorId: 'lotus_seed' });
      s.capTable.push({ id: 'sh-a', name: 'Banyan Ventures', kind: 'investor', shares: 4000000, invested: 400000000, round: 'Series A', investorId: 'banyan' });
      s.capTable.push({ id: 'sh-b', name: 'Meridian Growth Partners', kind: 'investor', shares: 5000000, invested: 1500000000, round: 'Series B', investorId: 'meridian_growth' });
      s.capTable.push({ id: 'sh-pool', name: 'Employee option pool', kind: 'option_pool', shares: 3000000, invested: 0, round: null });
      s.board.members.push({ id: 'b-banyan', name: 'Banyan Ventures', kind: 'investor', priority: 'market_share', satisfaction: 65 }, { id: 'b-meridian', name: 'Meridian Growth Partners', kind: 'investor', priority: 'profitability', satisfaction: 65 });
      s.board.approvalsRequired = true;
      s.board.expectations = { growth: 0.6, minRunwayMonths: 12 };
      s.rounds.push({ kind: 'series_b', day: -120, amount: 1500000000, preMoney: 6000000000, postMoney: 7500000000, pricePerShare: 300, newShares: 5000000, investors: ['Meridian Growth Partners'] });
      for (const m of ['mum', 'del']) {
        const ms = s.markets.find((x) => x.id === m);
        if (ms) { ms.entered = true; ms.enteredDay = 0; }
        for (const seg of segmentsFor(s)) s.company.awareness[msKey(m, seg)] = 0.08;
      }
      const office = s.facilities.find((f) => f.kind === 'office');
      if (office) { office.capacity = 150; office.quality = 65; office.rent = Math.round(office.rent * 30); }
      s.marketing.budgets.paid_search = 3000000;
      s.marketing.budgets.content = 1000000;
      s.marketing.budgets.events = 1500000;
      s.marketing.budgets.direct_sales = 500000;
      break;
    }
    case 'monopoly':
    case 'hypergrowth':
    case 'startup':
    default:
      break;
  }
}

/** Monthly objective check. Returns true when the game should end as a win. */
export function checkScenario(s: SimState): void {
  const sc = s.scenario;
  if (!sc || sc.complete || sc.failed) return;
  const r = s.reports[s.reports.length - 1];
  if (!r) return;
  const months = s.reports.length;
  const runRate = computeValuation(s).runRate;
  let progress = 0;
  let complete = false;
  switch (sc.id) {
    case 'startup': progress = runRate / 1e7; complete = progress >= 1; break;
    case 'hypergrowth': progress = runRate / 1e9; complete = progress >= 1; break;
    case 'turnaround': {
      const last3 = s.reports.slice(-3);
      const streak = last3.length === 3 && last3.every((x) => x.income.netIncome > 0);
      progress = last3.filter((x) => x.income.netIncome > 0).length / 3;
      complete = streak;
      break;
    }
    case 'recession': progress = months / 24; complete = months >= 24 && s.finance.cash >= 0; break;
    case 'price_war': progress = clamp(r.kpis.marketShare / 0.15, 0, 1) * Math.min(1, months / 24); complete = months >= 24 && r.kpis.marketShare >= 0.15; break;
    case 'supply_crisis': {
      const fills = s.products.filter((p) => p.stage === 'launched').map((p) => s.metrics.fillRate[p.id] ?? 1);
      const fill = fills.length ? fills.reduce((a, b) => a + b, 0) / fills.length : 1;
      progress = Math.min(1, months / 18) * clamp(fill / 0.9, 0, 1);
      complete = months >= 18 && fill >= 0.9 && s.finance.cash >= 0;
      if (s.flags.scriptedBankruptcy && months === 2) {
        const sup = s.suppliers.find((x) => x.id === s.flags.scriptedBankruptcy);
        if (sup && sup.status === 'active') {
          sup.status = 'bankrupt';
          for (const o of s.orders) if (o.status === 'open' && o.supplierId === sup.id) o.status = 'cancelled';
          addNews(s, `${sup.name} collapses`, 'Your primary supplier has declared bankruptcy. All open orders are lost.', 'industry', 'negative');
        }
      }
      break;
    }
    case 'ipo': progress = s.company.isPublic ? 1 : s.ipo ? 0.8 : clamp(runRate / 1e9, 0, 0.7); complete = s.company.isPublic; break;
    case 'monopoly': progress = clamp(r.kpis.marketShare / 0.5, 0, 1); complete = r.kpis.marketShare >= 0.5; break;
  }
  sc.progress = clamp(progress, 0, 1);
  if (complete) {
    sc.complete = true;
    addNews(s, `Scenario complete: ${SCENARIO_BY_ID[sc.id]?.name}`, `Objective achieved: ${sc.objectiveText}. You can keep playing.`, 'company', 'positive');
    return;
  }
  if (sc.deadlineDay !== null && s.day >= sc.deadlineDay) {
    sc.failed = true;
    addNews(s, `Scenario failed: ${SCENARIO_BY_ID[sc.id]?.name}`, `The deadline passed without reaching: ${sc.objectiveText}. You can keep playing in free mode.`, 'company', 'negative');
  }
}

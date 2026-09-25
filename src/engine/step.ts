// The simulation loop. A day runs the operational systems; the last day of each
// month also closes the books and runs the slower systems, in this order:
// operations → people → product → finance → competitors → report → valuation →
// board → macro → opportunities → objectives → failure checks.
import { ACHIEVEMENTS } from './data/achievements';
import { MARKET_BY_ID } from './data/markets';
import type { SimState } from './types';
import { currentDate, daysInMonth } from './calendar';
import { industryOf, modifier, totalCustomers } from './context';
import { emptyMonth, payExpense, settleDaily } from './systems/ledger';
import { dailyExpansion, monthlyMarkets } from './systems/expansion';
import { dailyMarketing } from './systems/marketing';
import { dailyDevelopment, generateReviews, monthlyProducts, updateSatisfaction } from './systems/products';
import { dailyMarket } from './systems/market';
import { dailySales } from './systems/sales';
import { dailySupport, monthlySupport } from './systems/support';
import { dailyManufacturing, monthlyManufacturing } from './systems/manufacturing';
import { dailySuppliers, monthlySuppliers } from './systems/suppliers';
import { dailyHiring } from './systems/hiring';
import { dailyPayroll, monthlyEmployees, payPayroll } from './systems/employees';
import { dailyFundraising } from './systems/capital';
import { completeIpo, dailyStock, quarterlyEarnings } from './systems/stock';
import { dailyEvents, monthlyLegal } from './systems/events';
import { expireDecisions, generateOpportunities } from './systems/decisions';
import { monthlyFacilities } from './systems/facilities';
import { monthlyInventory } from './systems/inventory';
import { monthlyContracts } from './systems/contracts';
import { finishExperiments, monthlyPartnerships } from './systems/growth';
import { monthlySecurity, monthlyTech } from './systems/tech';
import { monthlyIntegration } from './systems/ma';
import { monthlyEsg, monthlyReputation, updatePmf } from './systems/reputation';
import { monthlyDepreciation } from './systems/assets';
import { monthlyLoans } from './systems/loans';
import { monthlyShareholderReturns, monthlyTaxes } from './systems/finance';
import { monthlyCompetitors, servedMarketShare } from './systems/competitors';
import { buildReport } from './systems/reports';
import { generateInsights, computeAlerts } from './systems/insights';
import { computeValuation } from './systems/valuation';
import { monthlyBoard } from './systems/board';
import { monthlyMacro } from './systems/macro';
import { checkScenario } from './systems/scenarios';
import { checkFailure } from './systems/failure';
import { addNews } from './systems/news';
import { priceElasticity } from './systems/pricing';

/** Simulate one day. Returns true if a month was closed. */
export function stepDay(s: SimState): boolean {
  if (s.status !== 'running') return false;
  dailyExpansion(s);
  dailyMarketing(s);
  dailyDevelopment(s);
  dailyMarket(s);
  dailySales(s);
  dailySupport(s);
  if (s.factories.length) dailyManufacturing(s);
  if (s.suppliers.length) dailySuppliers(s);
  dailyHiring(s);
  dailyPayroll(s);
  dailyFundraising(s);
  const badDebt = 0.004 + (s.macro.phase === 'recession' ? 0.012 : 0);
  settleDaily(s, badDebt);
  completeIpo(s);
  dailyStock(s);
  dailyEvents(s);
  expireDecisions(s);
  const d = currentDate(s);
  let closed = false;
  if (d.day === daysInMonth(d.year, d.month)) {
    closeMonth(s);
    closed = true;
  }
  s.day += 1;
  return closed;
}

function payDepartmentBudgets(s: SimState): void {
  for (const [dept, st] of Object.entries(s.departments)) {
    if (st.budget > 0) payExpense(s, 'tools', st.budget, `${dept} budget`);
  }
}

function payCompliance(s: SimState): void {
  const ind = industryOf(s);
  const markets = s.markets.filter((m) => m.entered).length;
  const regBurden = s.markets.filter((m) => m.entered).reduce((a, m) => a + (MARKET_BY_ID[m.id]?.regulation ?? 0), 0);
  const cost = ind.complianceCostPerMonth * (1 + 0.3 * (markets - 1) + regBurden) * modifier(s, 'compliance_cost') * s.macro.priceLevel;
  payExpense(s, 'compliance', cost, 'Compliance & licences');
}

export function closeMonth(s: SimState): void {
  const ind = industryOf(s);
  const unitsLastMonth = { ...s.month.unitsByProduct };
  const prevRevenue = s.reports.length ? s.reports[s.reports.length - 1].income.netRevenue : 0;

  // Operations
  monthlyFacilities(s);
  monthlyManufacturing(s);
  monthlyInventory(s);
  // People
  monthlyEmployees(s);
  payPayroll(s);
  // Product & customers
  monthlyProducts(s);
  updateSatisfaction(s);
  generateReviews(s);
  monthlySupport(s);
  monthlyContracts(s);
  monthlyPartnerships(s);
  // Technology, security, legal
  monthlyTech(s);
  monthlySecurity(s, ind.cyberExposure, totalCustomers(s));
  monthlyLegal(s);
  monthlyIntegration(s);
  payCompliance(s);
  payDepartmentBudgets(s);
  monthlyEsg(s);
  monthlyReputation(s);
  updatePmf(s);
  // Finance close
  monthlyDepreciation(s);
  monthlyLoans(s);
  monthlyTaxes(s);
  monthlyShareholderReturns(s);
  const launched = s.products.filter((p) => p.stage === 'launched');
  const elasticity = launched.length ? priceElasticity(s.config.targetSegment, s.company.brand, s.month.choiceSamples ? s.month.choiceShare / s.month.choiceSamples : 0.2) : 0;
  finishExperiments(s, s.month.funnel.visit, elasticity);

  // Competitors respond to this month's market.
  const ourRevenue = s.month.revenue - s.month.refunds;
  monthlyCompetitors(s, ourRevenue, prevRevenue);
  const share = servedMarketShare(s, ourRevenue);
  s.metrics.marketShare = share;

  // Report, then valuation (which reads the report history).
  const report = buildReport(s, s.metrics.valuation, share);
  report.insights = generateInsights(s, report);
  s.reports.push(report);
  const val = computeValuation(s);
  s.metrics.valuation = val.value;
  s.metrics.valuationDrivers = val.drivers;
  s.metrics.revenueRunRate = val.runRate;
  report.kpis.valuation = val.value;
  report.drivers.valuation = val.drivers;
  quarterlyEarnings(s);

  monthlyBoard(s);
  monthlyMacro(s);
  monthlyMarkets(s);
  generateOpportunities(s);
  if (s.suppliers.length) monthlySuppliers(s, unitsLastMonth);
  checkScenario(s);
  checkAchievements(s);
  checkFailure(s);

  s.flags.lastMonthQuits = s.month.quits;
  for (const pid in unitsLastMonth) s.flags[`lastUnits|${pid}`] = unitsLastMonth[pid];
  s.modifiers = s.modifiers.filter((m) => m.endDay >= s.day);
  s.alerts = computeAlerts(s);
  s.sales.wonThisMonth = 0;
  s.sales.lostThisMonth = 0;
  s.month = emptyMonth(s.finance.cash);
  s.flags.monthStartDay = s.day + 1;
}

export function checkAchievements(s: SimState): void {
  const hqCountry = MARKET_BY_ID[s.config.hqMarket].country;
  if (s.markets.some((m) => m.entered && MARKET_BY_ID[m.id].country !== hqCountry)) s.flags.international = true;
  for (const a of ACHIEVEMENTS) {
    if (s.achievements[a.id] !== undefined) continue;
    if (a.check(s)) {
      s.achievements[a.id] = s.day;
      addNews(s, `Milestone: ${a.name}`, a.description, 'company', 'positive');
    }
  }
}

export function advanceDays(s: SimState, n: number): void {
  for (let i = 0; i < n && s.status === 'running'; i++) stepDay(s);
}

/** Advance until `n` month-ends have been closed (or the game ends). */
export function advanceMonths(s: SimState, n: number): void {
  let closed = 0;
  let guard = 0;
  while (closed < n && s.status === 'running' && guard < n * 32) {
    if (stepDay(s)) closed++;
    guard++;
  }
}

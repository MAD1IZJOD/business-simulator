// Month-end reports: income statement, balance sheet and cash-flow statement
// built from ledger postings, plus KPIs, breakdowns and explainability drivers.
import { SEGMENTS } from '../data/segments';
import type { BalanceSheet, CashFlowStatement, DriverFactor, IncomeStatement, Kpis, MonthlyReport, SimState } from '../types';
import { launchedProducts, totalCustomers, totalFreeUsers } from '../context';
import { currentDate } from '../calendar';
import { addTo } from '../util';
import { inventoryValue, ppeValue, totalAP, totalAR, totalDebt } from './ledger';
import { averageMorale, averageProductivity } from './employees';
import { pipelineValue } from './sales';
import { revenuePerUnitOfActivity } from './market';
import { competitorRevenue } from './competitors';

export function incomeStatement(s: SimState): IncomeStatement {
  const m = s.month;
  const cogs = Object.values(m.cogs).reduce((a, b) => a + b, 0);
  const totalOpex = Object.values(m.opex).reduce((a, b) => a + b, 0);
  const netRevenue = m.revenue - m.refunds;
  const grossProfit = netRevenue - cogs;
  const ebitda = grossProfit - totalOpex;
  const ebit = ebitda - m.depreciation;
  const ebt = ebit - m.interest + m.otherIncome;
  return {
    revenue: m.revenue,
    refunds: m.refunds,
    netRevenue,
    cogs,
    cogsBreakdown: { ...m.cogs },
    grossProfit,
    opex: { ...m.opex },
    totalOpex,
    ebitda,
    depreciation: m.depreciation,
    ebit,
    interest: m.interest,
    otherIncome: m.otherIncome,
    ebt,
    tax: m.tax,
    netIncome: ebt - m.tax,
  };
}

export function balanceSheet(s: SimState): BalanceSheet {
  const f = s.finance;
  const cash = Math.max(0, f.cash);
  const overdraft = Math.max(0, -f.cash);
  const receivables = totalAR(s);
  const inventory = inventoryValue(s);
  const ppe = ppeValue(s);
  const totalAssets = cash + receivables + inventory + ppe + f.goodwill;
  const payables = totalAP(s);
  const debt = totalDebt(s);
  const totalLiabilities = payables + f.accruedPayroll + f.taxPayable + f.deferredRevenue + debt + overdraft;
  const equity = f.paidInCapital + f.retainedEarnings - f.treasuryStock;
  return {
    cash, receivables, inventory, ppe, goodwill: f.goodwill, totalAssets,
    payables, accrued: f.accruedPayroll, taxPayable: f.taxPayable, deferredRevenue: f.deferredRevenue, debt, overdraft, totalLiabilities,
    paidInCapital: f.paidInCapital, retainedEarnings: f.retainedEarnings, treasuryStock: f.treasuryStock, equity,
  };
}

export function cashFlowStatement(s: SimState): CashFlowStatement {
  const m = s.month;
  const sumOf = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
  const operating = sumOf(m.cashFlows.operating);
  const investing = sumOf(m.cashFlows.investing);
  const financing = sumOf(m.cashFlows.financing);
  return {
    beginCash: m.beginCash,
    operating,
    investing,
    financing,
    net: operating + investing + financing,
    endCash: s.finance.cash,
    items: { operating: { ...m.cashFlows.operating }, investing: { ...m.cashFlows.investing }, financing: { ...m.cashFlows.financing } },
  };
}

function driverList(drv: Record<string, number>, prefix: string, weightKey?: string): DriverFactor[] {
  const w = weightKey ? drv[`${prefix}.${weightKey}`] ?? 0 : 1;
  const out: DriverFactor[] = [];
  for (const k in drv) {
    if (!k.startsWith(prefix + '.') || k.includes('.__')) continue;
    const v = weightKey ? (w > 0 ? drv[k] / w : 0) : drv[k];
    out.push({ label: k.slice(prefix.length + 1).replace(/_/g, ' '), value: v });
  }
  return out;
}

export function buildReport(s: SimState, valuation: number, marketShare: number): MonthlyReport {
  const d = currentDate(s);
  const income = incomeStatement(s);
  const balance = balanceSheet(s);
  const cashflow = cashFlowStatement(s);
  const m = s.month;
  const prev = s.reports[s.reports.length - 1];
  const customers = totalCustomers(s);
  const churnRate = m.churnBase > 0 ? m.churned / m.churnBase : 0;
  const marketingSpend = Object.values(m.marketingSpend).reduce((a, b) => a + b, 0);
  const salesSalaries = (m.salaryByDept.sales ?? 0) + (m.salaryByDept.marketing ?? 0);
  const acquisitionCost = marketingSpend + salesSalaries;
  const cac = m.newCustomers > 0.5 ? acquisitionCost / m.newCustomers : 0;
  const avgCustomers = prev ? (prev.kpis.customers + customers) / 2 : customers;
  const arpu = avgCustomers > 0 ? income.netRevenue / avgCustomers : 0;
  const gm = income.netRevenue > 0 ? income.grossProfit / income.netRevenue : 0;
  const ltv = churnRate > 0.0005 ? (arpu * Math.max(0, gm)) / churnRate : arpu * Math.max(0, gm) * 60;
  const burn = -(cashflow.operating + cashflow.investing);
  const runway = burn > 0 ? Math.max(0, s.finance.cash) / burn : Infinity;
  const products = launchedProducts(s);
  const satisfaction = products.length ? products.reduce((a, p) => a + p.satisfaction, 0) / products.length : 0;
  let invUnits = 0;
  for (const id in s.inventory) invUnits += s.inventory[id].finished + s.inventory[id].raw;

  const kpis: Kpis = {
    revenue: income.netRevenue,
    runRate: income.netRevenue * 12,
    growthMoM: prev && prev.kpis.revenue > 0 ? income.netRevenue / prev.kpis.revenue - 1 : 0,
    grossMargin: gm,
    netIncome: income.netIncome,
    ebitda: income.ebitda,
    burn,
    runwayMonths: runway,
    cash: s.finance.cash,
    customers,
    newCustomers: m.newCustomers,
    churned: m.churned,
    churnRate,
    cac,
    ltv,
    arpu,
    paybackMonths: arpu * gm > 0 && cac > 0 ? cac / (arpu * gm) : 0,
    contributionMargin: income.netRevenue > 0 ? (income.grossProfit - marketingSpend) / income.netRevenue : 0,
    marketShare,
    valuation,
    employees: s.employees.length,
    productivity: averageProductivity(s),
    morale: averageMorale(s),
    inventoryValue: balance.inventory,
    inventoryUnits: invUnits,
    stockoutDays: m.stockoutDays,
    satisfaction,
    brand: s.company.brand,
    pipelineValue: pipelineValue(s, (b) => {
      const p = s.products.find((x) => x.id === b.productId);
      return p ? revenuePerUnitOfActivity(s, p, b.marketId, b.segmentId) * 12 : 0;
    }),
    responseHours: s.metrics.responseHours,
    stockPrice: s.stock?.price ?? 0,
    freeUsers: totalFreeUsers(s),
    avgPrice: m.units > 0 ? m.priceWeighted / m.units : 0,
    units: m.units,
    lostUnits: m.lostUnits,
    debt: balance.debt,
    headcountCost: (m.opex.salaries ?? 0) + (m.cogs.labor ?? 0),
    marketingSpend,
    pmf: s.company.pmf,
    esg: s.esg.score,
  };

  const customersByProduct: Record<string, number> = {};
  const customersByMarket: Record<string, number> = {};
  const customersBySegment: Record<string, number> = {};
  for (const k in s.cells) {
    const c = s.cells[k];
    addTo(customersByProduct, c.productId, c.customers);
    addTo(customersByMarket, c.marketId, c.customers);
    addTo(customersBySegment, c.segmentId, c.customers);
  }
  const headcountByDept: Record<string, number> = {};
  for (const e of s.employees) addTo(headcountByDept, e.dept, 1);
  const competitorShare: Record<string, number> = {};
  const competitorRev: Record<string, number> = {};
  let compTotal = 0;
  const served = new Set(s.markets.filter((x) => x.entered).map((x) => x.id));
  for (const c of s.competitors) if (c.status === 'active') { const r = competitorRevenue(s, c, served); competitorRev[c.id] = r; compTotal += r; }
  const total = compTotal + income.netRevenue;
  for (const id in competitorRev) competitorShare[id] = total > 0 ? competitorRev[id] / total : 0;

  // Explainability drivers (averages over the month).
  const drivers: Record<string, DriverFactor[]> = {
    churn: driverList(m.drv, 'churn', '__w'),
    morale: driverList(m.drv, 'morale'),
    brand: driverList(m.drv, 'brand'),
    pmf: driverList(m.drv, 'pmf'),
    valuation: s.metrics.valuationDrivers,
    signals: [
      { label: 'In-market buyers', value: m.demandIndex },
      { label: 'Average awareness', value: m.awarenessAvg },
      { label: 'Choice share', value: m.choiceSamples > 0 ? m.choiceShare / m.choiceSamples : 0 },
      { label: 'Average realised price', value: kpis.avgPrice },
      { label: 'Lost units (stockouts/capacity)', value: m.lostUnits },
      { label: 'Consumer confidence', value: s.macro.consumerConfidence },
      { label: 'Business confidence', value: s.macro.businessConfidence },
      { label: 'Expansion', value: m.funnel.expansion },
    ],
    segments: Object.entries(customersBySegment).map(([k, v]) => ({ label: SEGMENTS[k as keyof typeof SEGMENTS]?.name ?? k, value: v })),
  };

  return {
    index: s.reports.length,
    year: d.year,
    month: d.month,
    endDay: s.day,
    income,
    balance,
    cashflow,
    kpis,
    funnel: { ...m.funnel },
    breakdown: {
      revenueByProduct: { ...m.revenueByProduct },
      revenueByMarket: { ...m.revenueByMarket },
      revenueBySegment: { ...m.revenueBySegment },
      customersByProduct,
      customersByMarket,
      customersBySegment,
      newByChannel: { ...m.newByChannel },
      spendByChannel: { ...m.marketingSpend },
      headcountByDept,
      salaryByDept: { ...m.salaryByDept },
      competitorShare,
      competitorRevenue: competitorRev,
    },
    drivers,
    macro: {
      phase: s.macro.phase,
      gdpGrowth: s.macro.gdpGrowth,
      inflation: s.macro.inflation,
      interestRate: s.macro.interestRate,
      unemployment: s.macro.unemployment,
      consumerConfidence: s.macro.consumerConfidence,
      businessConfidence: s.macro.businessConfidence,
      marketIndex: s.macro.marketIndex,
    },
    insights: [],
  };
}

/** Aggregate monthly reports into a quarter or year (flows summed, balances from the last month). */
export function aggregateReports(reports: MonthlyReport[]): MonthlyReport | null {
  if (!reports.length) return null;
  const last = reports[reports.length - 1];
  const first = reports[0];
  const sumRec = (get: (r: MonthlyReport) => Record<string, number>) => {
    const out: Record<string, number> = {};
    for (const r of reports) for (const [k, v] of Object.entries(get(r))) out[k] = (out[k] ?? 0) + v;
    return out;
  };
  const sum = (get: (r: MonthlyReport) => number) => reports.reduce((a, r) => a + get(r), 0);
  const inc: IncomeStatement = {
    revenue: sum((r) => r.income.revenue),
    refunds: sum((r) => r.income.refunds),
    netRevenue: sum((r) => r.income.netRevenue),
    cogs: sum((r) => r.income.cogs),
    cogsBreakdown: sumRec((r) => r.income.cogsBreakdown) as IncomeStatement['cogsBreakdown'],
    grossProfit: sum((r) => r.income.grossProfit),
    opex: sumRec((r) => r.income.opex) as IncomeStatement['opex'],
    totalOpex: sum((r) => r.income.totalOpex),
    ebitda: sum((r) => r.income.ebitda),
    depreciation: sum((r) => r.income.depreciation),
    ebit: sum((r) => r.income.ebit),
    interest: sum((r) => r.income.interest),
    otherIncome: sum((r) => r.income.otherIncome),
    ebt: sum((r) => r.income.ebt),
    tax: sum((r) => r.income.tax),
    netIncome: sum((r) => r.income.netIncome),
  };
  const cf: CashFlowStatement = {
    beginCash: first.cashflow.beginCash,
    operating: sum((r) => r.cashflow.operating),
    investing: sum((r) => r.cashflow.investing),
    financing: sum((r) => r.cashflow.financing),
    net: sum((r) => r.cashflow.net),
    endCash: last.cashflow.endCash,
    items: {
      operating: sumRec((r) => r.cashflow.items.operating),
      investing: sumRec((r) => r.cashflow.items.investing),
      financing: sumRec((r) => r.cashflow.items.financing),
    },
  };
  return { ...last, income: inc, cashflow: cf };
}

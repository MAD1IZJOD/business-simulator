// Automated insights, alerts, health indicators and risk scores. Everything here
// is derived from simulation state and reports — each item cites its evidence.
import type { Alert, Insight, MonthlyReport, SimState } from '../types';
import { industryOf, launchedProducts, physical, totalCustomers } from '../context';
import { clamp } from '../util';
import { upcomingLoanPayments } from './loans';
import { activeContracts, customerConcentration } from './contracts';
import { onOrder, orderKind } from './suppliers';
import { openDecisions } from './decisionCore';

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const inr = (v: number) => {
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(2)} L`;
  return `${sign}₹${Math.round(a).toLocaleString('en-IN')}`;
};

export function generateInsights(s: SimState, r: MonthlyReport): Insight[] {
  const out: Insight[] = [];
  const reps = s.reports;
  const prev = reps[reps.length - 1];
  const prev3 = reps[reps.length - 3];
  if (prev && prev3) {
    const revUp = r.kpis.revenue > prev3.kpis.revenue * 1.05;
    const cashDown = r.kpis.cash < prev3.kpis.cash * 0.95;
    if (revUp && cashDown) out.push({
      id: 'rev_up_cash_down', tone: 'negative', title: 'Revenue is growing but cash is declining',
      detail: 'Growth is consuming cash — through acquisition spend, working capital (receivables/inventory) or hiring ahead of revenue.',
      evidence: [`Revenue ${inr(prev3.kpis.revenue)} → ${inr(r.kpis.revenue)} over 3 months`, `Cash ${inr(prev3.kpis.cash)} → ${inr(r.kpis.cash)}`, `Receivables now ${inr(r.balance.receivables)}, inventory ${inr(r.balance.inventory)}`],
    });
  }
  if (prev && prev.kpis.inventoryValue > 0 && prev.kpis.revenue > 0) {
    const invG = r.kpis.inventoryValue / prev.kpis.inventoryValue - 1;
    const salesG = r.kpis.revenue / prev.kpis.revenue - 1;
    if (invG > salesG + 0.15 && invG > 0.1) out.push({
      id: 'inventory_outpacing', tone: 'negative', title: 'Inventory is growing faster than sales',
      detail: 'Excess stock ties up cash and incurs carrying costs and spoilage. Consider lowering reorder quantities.',
      evidence: [`Inventory +${pct(invG)} vs sales ${salesG >= 0 ? '+' : ''}${pct(salesG)}`, `Inventory value ${inr(r.kpis.inventoryValue)}`],
    });
  }
  if (prev && prev.kpis.marketingSpend > 0 && prev.kpis.cac > 0) {
    const spendG = r.kpis.marketingSpend / prev.kpis.marketingSpend - 1;
    const cacG = r.kpis.cac / prev.kpis.cac - 1;
    if (spendG > 0.15 && cacG > 0.15) out.push({
      id: 'cac_rising', tone: 'negative', title: 'Marketing spend increased but CAC also increased',
      detail: 'Channels are saturating or you are reaching lower-intent audiences. Diminishing returns are setting in.',
      evidence: [`Spend +${pct(spendG)}`, `CAC ${inr(prev.kpis.cac)} → ${inr(r.kpis.cac)}`],
    });
  }
  const segCust = r.breakdown.customersBySegment;
  if ((segCust.enterprise ?? 0) + (segCust.government ?? 0) > 0) {
    const ent = Object.values(s.sales.pipeline).filter((b) => b.segmentId === 'enterprise' || b.segmentId === 'government');
    const open = ent.reduce((a, b) => a + b.qualified + b.proposal + b.negotiation, 0);
    if (open > 1) out.push({
      id: 'enterprise_cycle', tone: 'neutral', title: 'Enterprise customers have high value but long sales cycles',
      detail: 'Large accounts churn less and pay more, but deals take months to close. Keep the pipeline full and account executives staffed.',
      evidence: [`${open.toFixed(1)} enterprise/government deals in progress`, `${((segCust.enterprise ?? 0) + (segCust.government ?? 0)).toFixed(0)} large accounts today`],
    });
  }
  if (prev && r.kpis.churnRate > prev.kpis.churnRate * 1.25 && r.kpis.churnRate > 0.02) {
    const top = [...(r.drivers.churn ?? [])].sort((a, b) => b.value - a.value)[0];
    out.push({ id: 'churn_up', tone: 'negative', title: 'Churn is rising', detail: `The biggest upward pressure on churn is ${top ? top.label : 'unclear'}.`, evidence: [`Churn ${pct(prev.kpis.churnRate)} → ${pct(r.kpis.churnRate)}`] });
  }
  if (r.kpis.grossMargin < (prev?.kpis.grossMargin ?? r.kpis.grossMargin) - 0.05 && r.kpis.revenue > 0) out.push({
    id: 'margin_down', tone: 'negative', title: 'Gross margin fell', detail: 'Discounts, rising unit costs or a shift to lower-margin products are squeezing margins.',
    evidence: [`Gross margin ${pct(prev!.kpis.grossMargin)} → ${pct(r.kpis.grossMargin)}`],
  });
  if (r.kpis.ltv > 0 && r.kpis.cac > 0) {
    const ratio = r.kpis.ltv / r.kpis.cac;
    if (ratio < 1) out.push({ id: 'ltv_cac_bad', tone: 'negative', title: 'You lose money on each new customer', detail: 'Customer lifetime value is below acquisition cost. Growth this way destroys value.', evidence: [`LTV ${inr(r.kpis.ltv)} vs CAC ${inr(r.kpis.cac)} (${ratio.toFixed(2)}×)`] });
    else if (ratio > 3.5 && r.kpis.runwayMonths > 9) out.push({ id: 'ltv_cac_good', tone: 'positive', title: 'Strong unit economics — room to invest in growth', detail: 'Each customer is worth several times what it costs to acquire. More acquisition spend could pay off.', evidence: [`LTV/CAC ${ratio.toFixed(1)}×`, `Payback ${r.kpis.paybackMonths.toFixed(1)} months`] });
  }
  if (r.kpis.lostUnits > r.kpis.units * 0.1 && r.kpis.lostUnits > 5) out.push({
    id: 'capacity', tone: 'negative', title: 'Demand is going unserved', detail: physical(s) ? 'Stockouts are turning buyers away. Increase reorder points or production.' : 'Delivery capacity is too low. Hire service staff or open locations.',
    evidence: [`${Math.round(r.kpis.lostUnits).toLocaleString('en-IN')} units of demand lost vs ${Math.round(r.kpis.units).toLocaleString('en-IN')} served`],
  });
  const conc = customerConcentration(s, r.kpis.revenue);
  if (conc.share > 0.3) out.push({ id: 'concentration', tone: 'negative', title: 'Revenue is concentrated in one customer', detail: `Losing ${conc.client} would be a serious blow.`, evidence: [`${conc.client} ≈ ${pct(conc.share)} of revenue`] });
  const moraleD = [...(r.drivers.morale ?? [])].sort((a, b) => a.value - b.value)[0];
  if (r.kpis.morale > 0 && r.kpis.morale < 45 && moraleD) out.push({ id: 'morale', tone: 'negative', title: 'Employee morale is low', detail: `The biggest drag is ${moraleD.label}. Low morale cuts productivity and drives attrition.`, evidence: [`Average morale ${r.kpis.morale.toFixed(0)}/100`] });
  if (r.kpis.netIncome > 0 && (prev?.kpis.netIncome ?? -1) <= 0) out.push({ id: 'first_profit', tone: 'positive', title: 'The company turned profitable', detail: 'Net income is positive this month.', evidence: [`Net income ${inr(r.kpis.netIncome)}`] });
  return out;
}

export function computeAlerts(s: SimState): Alert[] {
  const a: Alert[] = [];
  const r = s.reports[s.reports.length - 1];
  const ind = industryOf(s);
  if (s.finance.cash < 0) a.push({ id: 'overdraft', severity: 'critical', title: 'Cash is negative (overdraft)', detail: `Overdrawn by ${inr(-s.finance.cash)}. The company fails if this continues.`, day: s.day, link: 'finance' });
  if (r && r.kpis.runwayMonths < 3) a.push({ id: 'runway', severity: 'critical', title: `Runway: ${r.kpis.runwayMonths.toFixed(1)} months`, detail: `Burning ${inr(r.kpis.burn)}/month with ${inr(s.finance.cash)} in the bank. Raise money, borrow, or cut costs.`, day: s.day, link: 'finance' });
  else if (r && r.kpis.runwayMonths < 6) a.push({ id: 'runway', severity: 'warning', title: `Runway: ${r.kpis.runwayMonths.toFixed(1)} months`, detail: `Burn ${inr(r.kpis.burn)}/month.`, day: s.day, link: 'finance' });
  if (r && r.kpis.churnRate > ind.baseChurn * 2 && r.kpis.customers > 10) a.push({ id: 'churn', severity: 'warning', title: `High churn: ${pct(r.kpis.churnRate)}/month`, detail: `About ${(ind.baseChurn * 100).toFixed(1)}% is typical in ${ind.name}.`, day: s.day, link: 'customers' });
  const lastQuits = Number(s.flags.lastMonthQuits ?? 0);
  if (lastQuits >= Math.max(2, s.employees.length * 0.05)) a.push({ id: 'attrition', severity: 'warning', title: `${lastQuits} resignations this month`, detail: 'Check morale drivers in People.', day: s.day, link: 'people' });
  const pay = upcomingLoanPayments(s);
  if (pay > 0 && pay > s.finance.cash * 0.5) a.push({ id: 'debt', severity: 'warning', title: 'Loan payments are large relative to cash', detail: `${inr(pay)} due at month end, ${inr(s.finance.cash)} in cash.`, day: s.day, link: 'finance' });
  if (s.loans.some((l) => l.status === 'defaulted' && l.balance > 0)) a.push({ id: 'default', severity: 'critical', title: 'A loan is in default', detail: 'The lender is seizing cash. Repay or raise immediately.', day: s.day, link: 'finance' });
  if (s.loans.some((l) => l.covenants.some((c) => c.breached))) a.push({ id: 'covenant', severity: 'warning', title: 'Debt covenant breached', detail: 'Penalty rates apply; repeated breaches can trigger repayment.', day: s.day, link: 'finance' });
  if (physical(s)) {
    const kind = orderKind(s);
    for (const p of launchedProducts(s)) {
      const inv = s.inventory[p.id];
      if (!inv) continue;
      const onHand = kind === 'raw' ? inv.raw + inv.finished : inv.finished;
      if (onHand + onOrder(s, p.id, kind) < Math.max(1, inv.reorderPoint * 0.5)) a.push({ id: `stock_${p.id}`, severity: 'warning', title: `Low inventory: ${p.name}`, detail: `${Math.round(onHand).toLocaleString('en-IN')} units on hand. Order more in Operations.`, day: s.day, link: 'operations' });
    }
    const late = s.orders.filter((o) => o.status === 'open' && o.late).length;
    if (late) a.push({ id: 'late', severity: 'warning', title: `${late} supplier deliveries are late`, detail: 'Consider a backup supplier.', day: s.day, link: 'operations' });
    const bankrupt = s.suppliers.filter((x) => x.status === 'bankrupt').length;
    if (bankrupt && !s.suppliers.some((x) => x.status === 'active')) a.push({ id: 'nosupplier', severity: 'critical', title: 'No active suppliers', detail: 'You cannot restock. Negotiate with a new supplier.', day: s.day, link: 'operations' });
  }
  if (s.metrics.responseHours > 48 && totalCustomers(s) > 20) a.push({ id: 'support', severity: 'warning', title: `Support response time ${s.metrics.responseHours.toFixed(0)}h`, detail: 'Customer complaints are piling up. Hire support agents.', day: s.day, link: 'customers' });
  if (s.legalCases.some((l) => l.status === 'open')) a.push({ id: 'legal', severity: 'info', title: 'Open legal matters', detail: `${s.legalCases.filter((l) => l.status === 'open').length} case(s) in progress.`, day: s.day, link: 'research' });
  if (s.company.reputation.regulatory < 30 && ind.regulation > 0.6) a.push({ id: 'regulatory', severity: 'critical', title: 'Regulators are watching', detail: `Regulatory reputation ${s.company.reputation.regulatory.toFixed(0)}/100. Hire legal counsel before it becomes a shutdown risk.`, day: s.day, link: 'research' });
  const opps = openDecisions(s).filter((d) => d.category === 'opportunity').length;
  if (opps) a.push({ id: 'opps', severity: 'opportunity', title: `${opps} opportunit${opps === 1 ? 'y' : 'ies'} waiting`, detail: 'Review them in the decision inbox.', day: s.day, link: 'dashboard' });
  if (launchedProducts(s).length === 0 && !s.products.some((p) => p.stage === 'development' && p.dev.progress >= 1)) a.push({ id: 'noproduct', severity: 'info', title: 'No product on the market yet', detail: 'Revenue starts once you launch.', day: s.day, link: 'products' });
  return a;
}

export interface HealthIndicator {
  id: string;
  label: string;
  score: number; // 0..100, higher is healthier
  summary: string;
  factors: { label: string; value: string; good: boolean }[];
}

export function computeHealth(s: SimState): HealthIndicator[] {
  const r = s.reports[s.reports.length - 1];
  const k = r?.kpis;
  const ind = industryOf(s);
  const runway = k ? Math.min(24, k.runwayMonths) : 12;
  const fin = clamp(runway * 3 + (k && k.ebitda > 0 ? 25 : 0) + (k ? clamp(k.grossMargin * 40, -10, 25) : 0), 0, 100);
  const fill = launchedProducts(s).length ? launchedProducts(s).reduce((a, p) => a + (s.metrics.fillRate[p.id] ?? 1), 0) / launchedProducts(s).length : 1;
  const ops = clamp(fill * 50 + s.metrics.reliability * 0.3 + clamp(30 - s.metrics.responseHours / 2, 0, 20), 0, 100);
  const cust = clamp((k?.satisfaction ?? 50) * 0.5 + clamp(50 - ((k?.churnRate ?? ind.baseChurn) / ind.baseChurn) * 20, 0, 40) + s.company.pmf * 0.1, 0, 100);
  const emp = clamp((k?.morale ?? 60) * 0.8 + clamp(20 - Number(s.flags.lastMonthQuits ?? 0) * 3, 0, 20), 0, 100);
  const share = k?.marketShare ?? 0;
  const mkt = clamp(share * 250 + s.company.brand * 0.4, 0, 100);
  const innov = clamp(s.company.culture.innovation * 0.4 + s.research.unlocked.length * 6 + Object.values(s.tech.levels).reduce((a, b) => a + b, 0) * 3 + s.products.filter((p) => p.patent?.status === 'granted').length * 8, 0, 100);
  const risks = computeRisks(s);
  const riskAvg = risks.reduce((a, x) => a + x.score, 0) / risks.length;
  return [
    { id: 'financial', label: 'Financial', score: fin, summary: k ? `${Number.isFinite(k.runwayMonths) ? k.runwayMonths.toFixed(1) + ' mo runway' : 'Cash-flow positive'}, ${pct(k.grossMargin)} gross margin` : 'No history yet',
      factors: [{ label: 'Runway', value: k ? (Number.isFinite(k.runwayMonths) ? `${k.runwayMonths.toFixed(1)} mo` : '∞') : '–', good: runway >= 12 }, { label: 'EBITDA', value: k ? inr(k.ebitda) : '–', good: (k?.ebitda ?? 0) > 0 }, { label: 'Gross margin', value: k ? pct(k.grossMargin) : '–', good: (k?.grossMargin ?? 0) > 0.4 }] },
    { id: 'operational', label: 'Operational', score: ops, summary: `${pct(fill)} demand fulfilled, ${s.metrics.responseHours.toFixed(0)}h support response`,
      factors: [{ label: 'Fulfillment', value: pct(fill), good: fill > 0.95 }, { label: 'Reliability', value: s.metrics.reliability.toFixed(0), good: s.metrics.reliability > 85 }, { label: 'Support response', value: `${s.metrics.responseHours.toFixed(0)}h`, good: s.metrics.responseHours < 24 }] },
    { id: 'customer', label: 'Customer', score: cust, summary: `Satisfaction ${(k?.satisfaction ?? 0).toFixed(0)}, churn ${pct(k?.churnRate ?? 0)}/mo`,
      factors: [{ label: 'Satisfaction', value: (k?.satisfaction ?? 0).toFixed(0), good: (k?.satisfaction ?? 0) > 60 }, { label: 'Churn', value: pct(k?.churnRate ?? 0), good: (k?.churnRate ?? 1) <= ind.baseChurn }, { label: 'PMF', value: s.company.pmf.toFixed(0), good: s.company.pmf > 55 }] },
    { id: 'employee', label: 'Employees', score: emp, summary: `Morale ${(k?.morale ?? 0).toFixed(0)}, ${Number(s.flags.lastMonthQuits ?? 0)} quits last month`,
      factors: [{ label: 'Morale', value: (k?.morale ?? 0).toFixed(0), good: (k?.morale ?? 0) > 60 }, { label: 'Quits (last month)', value: String(Number(s.flags.lastMonthQuits ?? 0)), good: Number(s.flags.lastMonthQuits ?? 0) === 0 }, { label: 'Employer reputation', value: s.company.reputation.employer.toFixed(0), good: s.company.reputation.employer > 55 }] },
    { id: 'market', label: 'Market position', score: mkt, summary: `${pct(share)} market share, brand ${s.company.brand.toFixed(0)}`,
      factors: [{ label: 'Market share', value: pct(share), good: share > 0.1 }, { label: 'Brand', value: s.company.brand.toFixed(0), good: s.company.brand > 50 }] },
    { id: 'innovation', label: 'Innovation', score: innov, summary: `${s.research.unlocked.length} research breakthroughs, ${Object.values(s.tech.levels).reduce((a, b) => a + b, 0)} tech levels`,
      factors: [{ label: 'Culture: innovation', value: s.company.culture.innovation.toFixed(0), good: s.company.culture.innovation > 55 }, { label: 'Patents granted', value: String(s.products.filter((p) => p.patent?.status === 'granted').length), good: s.products.some((p) => p.patent?.status === 'granted') }] },
    { id: 'risk', label: 'Risk', score: clamp(100 - riskAvg, 0, 100), summary: `Highest risk: ${[...risks].sort((a, b) => b.score - a.score)[0].label}`,
      factors: [...risks].sort((a, b) => b.score - a.score).slice(0, 3).map((x) => ({ label: x.label, value: x.score.toFixed(0), good: x.score < 40 })) },
  ];
}

export interface RiskScore {
  id: string;
  label: string;
  score: number; // 0..100, higher = riskier
  drivers: string[];
}

export function computeRisks(s: SimState): RiskScore[] {
  const r = s.reports[s.reports.length - 1];
  const k = r?.kpis;
  const ind = industryOf(s);
  const runway = k ? k.runwayMonths : 12;
  const debt = s.loans.reduce((a, l) => a + (l.status === 'active' ? l.balance : 0), 0);
  const ebitdaAnnual = (k?.ebitda ?? 0) * 12;
  const leverage = ebitdaAnnual > 0 ? debt / ebitdaAnnual : debt > 0 ? 5 : 0;
  const active = s.suppliers.filter((x) => x.status === 'active');
  const topComp = s.competitors.filter((c) => c.status === 'active').sort((a, b) => b.brand - a.brand)[0];
  const conc = customerConcentration(s, k?.revenue ?? 0);
  const keyPeople = s.employees.filter((e) => e.key).length;
  const lowMorale = s.employees.filter((e) => e.morale < 40).length / Math.max(1, s.employees.length);
  return [
    { id: 'financial', label: 'Financial risk', score: clamp((Number.isFinite(runway) ? clamp(80 - runway * 5, 0, 80) : 0) + leverage * 8 + (s.finance.cash < 0 ? 30 : 0), 0, 100), drivers: [`Runway ${Number.isFinite(runway) ? runway.toFixed(1) + ' months' : 'unlimited'}`, `Debt/EBITDA ${leverage.toFixed(1)}×`] },
    { id: 'market', label: 'Market risk', score: clamp(30 + (s.macro.phase === 'recession' ? 25 : s.macro.phase === 'slowdown' ? 10 : 0) * Math.max(0, ind.cyclicality) + (topComp ? (topComp.brand - s.company.brand) * 0.4 : 0) + ind.competition * 20, 0, 100), drivers: [`Economy: ${s.macro.phase}`, topComp ? `Strongest rival: ${topComp.name} (brand ${topComp.brand.toFixed(0)})` : 'No active rivals'] },
    { id: 'operational', label: 'Operational risk', score: clamp(ind.complexity * 40 + (100 - s.metrics.reliability) * 0.6 + (s.metrics.serviceUtilization > 1 ? 20 : 0), 0, 100), drivers: [`Reliability ${s.metrics.reliability.toFixed(0)}`, `Complexity ${(ind.complexity * 100).toFixed(0)}`] },
    { id: 'supplier', label: 'Supplier risk', score: physical(s) ? clamp(active.length <= 1 ? 70 : 40 - active.length * 5 + (active.reduce((a, x) => a + x.risk, 0) / Math.max(1, active.length)) * 100 + s.orders.filter((o) => o.late && o.status === 'open').length * 5, 0, 100) : 5, drivers: physical(s) ? [`${active.length} active suppliers`, `${s.orders.filter((o) => o.late && o.status === 'open').length} late orders`] : ['Digital business: minimal supply chain'] },
    { id: 'regulatory', label: 'Regulatory risk', score: clamp(ind.regulation * 60 + (60 - s.company.reputation.regulatory) * 0.8 + s.legalCases.filter((l) => l.status === 'open').length * 8, 0, 100), drivers: [`Industry regulation ${(ind.regulation * 100).toFixed(0)}%`, `Regulatory reputation ${s.company.reputation.regulatory.toFixed(0)}`] },
    { id: 'cyber', label: 'Cybersecurity risk', score: clamp(s.security.vulnerability, 0, 100), drivers: [`Vulnerability ${s.security.vulnerability.toFixed(0)}`, `Security level ${s.tech.levels.cybersecurity}`, `${s.security.incidents} past incidents`] },
    { id: 'concentration', label: 'Customer concentration', score: clamp(conc.share * 150, 0, 100), drivers: conc.client ? [`${conc.client}: ${pct(conc.share)} of revenue`, `${activeContracts(s).length} large contracts`] : ['No single large customer'] },
    { id: 'employee', label: 'Employee risk', score: clamp(lowMorale * 100 + (keyPeople <= 1 && s.employees.length > 5 ? 20 : 0) + s.company.layoffShock * 40, 0, 100), drivers: [`${(lowMorale * 100).toFixed(0)}% of staff with low morale`, `${keyPeople} key people`] },
  ];
}

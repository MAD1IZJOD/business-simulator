// "Why did this happen?" — decomposes month-over-month changes in key metrics
// into contributing factors using the recorded reports and drivers. Where a
// decomposition is exact (profit bridge, cash bridge, revenue = ARPU × customers)
// the factors sum to the change.
import { CHANNELS } from './data/channels';
import type { MonthlyReport, SimState } from './types';

export type ExplainMetric =
  | 'revenue' | 'profit' | 'cash' | 'churn' | 'cac' | 'customers' | 'morale' | 'valuation'
  | 'brand' | 'marketShare' | 'grossMargin' | 'pmf';

export interface ExplainFactor {
  label: string;
  impact: number; // in metric units (₹, points, pp), signed
  detail?: string;
}

export interface Explanation {
  metric: ExplainMetric;
  title: string;
  unit: 'inr' | 'pct' | 'points' | 'count' | 'mult';
  from: number | null;
  to: number;
  factors: ExplainFactor[];
  notes: string[];
  exact: boolean;
}

const OPEX_LABELS: Record<string, string> = {
  salaries: 'Salaries', marketing: 'Marketing', rent: 'Rent', rd: 'R&D', tools: 'Department budgets', recruiting: 'Recruiting',
  legal: 'Legal', security: 'Security', carrying: 'Inventory carrying', warranty: 'Warranty', maintenance: 'Maintenance',
  severance: 'Severance', utilities: 'Utilities', compliance: 'Compliance', esg: 'ESG programs', integration: 'Integration',
  writeoffs: 'Write-offs', bad_debt: 'Bad debt', implementation: 'Implementation', fees: 'Fees', other: 'Other',
};

const channelName = (k: string) => (CHANNELS[k as keyof typeof CHANNELS]?.name ?? k.replace(/_/g, ' '));

function signal(r: MonthlyReport, label: string): number {
  return r.drivers.signals?.find((x) => x.label === label)?.value ?? 0;
}

export function explain(s: SimState, metric: ExplainMetric, index = s.reports.length - 1): Explanation | null {
  const cur = s.reports[index];
  if (!cur) return null;
  const prev = index > 0 ? s.reports[index - 1] : null;
  switch (metric) {
    case 'revenue': return explainRevenue(cur, prev);
    case 'profit': return explainProfit(cur, prev);
    case 'cash': return explainCash(cur);
    case 'churn': return explainChurn(cur, prev);
    case 'cac': return explainCac(cur, prev);
    case 'customers': return explainCustomers(cur, prev);
    case 'morale': return explainList(metric, 'Why is morale where it is?', cur.kpis.morale, prev?.kpis.morale ?? null, cur.drivers.morale ?? [], 'points', 'Morale moves 30% of the way to its target each month. Target = 55 + the factors below.');
    case 'brand': return explainList(metric, 'What drives brand?', cur.kpis.brand, prev?.kpis.brand ?? null, cur.drivers.brand ?? [], 'points', `Brand moves 6% of the way toward its target each month (target ≈ 28 + factors).`);
    case 'pmf': return explainList(metric, 'Product-market fit components (0–100)', cur.kpis.pmf, prev?.kpis.pmf ?? null, cur.drivers.pmf ?? [], 'points', 'PMF is a weighted blend: retention 30%, satisfaction 20%, organic growth 15%, willingness to pay 15%, referrals 10%, activation 10%.');
    case 'valuation': return explainValuation(cur, prev);
    case 'marketShare': return explainShare(cur, prev);
    case 'grossMargin': return explainMargin(cur, prev);
  }
}

function explainRevenue(cur: MonthlyReport, prev: MonthlyReport | null): Explanation {
  const R1 = cur.kpis.revenue;
  const C1 = cur.kpis.customers;
  const notes: string[] = [];
  if (!prev) return { metric: 'revenue', title: 'Revenue this month', unit: 'inr', from: null, to: R1, factors: Object.entries(cur.income.revenue ? cur.breakdown.revenueByProduct : {}).map(([k, v]) => ({ label: k, impact: v })), notes: ['First month: no prior month to compare.'], exact: true };
  const R0 = prev.kpis.revenue;
  const C0 = prev.kpis.customers;
  const arpu1 = C1 > 0 ? R1 / C1 : 0;
  const arpu0 = C0 > 0 ? R0 / C0 : 0;
  const factors: ExplainFactor[] = [];
  // Exact: R1 - R0 = (ARPU1 - ARPU0)·C1 + ARPU0·(C1 - C0)
  const priceMix = (arpu1 - arpu0) * C1;
  const gained = cur.kpis.newCustomers;
  const lost = cur.kpis.churned;
  const other = C1 - C0 - gained + lost;
  factors.push({ label: 'Price, mix & usage (revenue per customer)', impact: priceMix, detail: `₹${Math.round(arpu0).toLocaleString('en-IN')} → ₹${Math.round(arpu1).toLocaleString('en-IN')} per customer` });
  factors.push({ label: 'New customers', impact: arpu0 * gained, detail: `+${gained.toFixed(1)} customers` });
  factors.push({ label: 'Churn', impact: -arpu0 * lost, detail: `−${lost.toFixed(1)} customers` });
  if (Math.abs(other) > 0.01) factors.push({ label: 'Other customer changes (acquisitions, exits, events)', impact: arpu0 * other });
  // Context: what moved acquisition.
  const d0 = signal(prev, 'In-market buyers'); const d1 = signal(cur, 'In-market buyers');
  const a0 = signal(prev, 'Average awareness'); const a1 = signal(cur, 'Average awareness');
  const c0 = signal(prev, 'Choice share'); const c1 = signal(cur, 'Choice share');
  const pctCh = (a: number, b: number) => (a > 0 ? `${((b / a - 1) * 100).toFixed(1)}%` : 'n/a');
  notes.push(`Market demand (in-market buyers): ${pctCh(d0, d1)} — driven by market growth, seasonality and the economy (consumer confidence ${signal(prev, 'Consumer confidence').toFixed(0)} → ${signal(cur, 'Consumer confidence').toFixed(0)}).`);
  notes.push(`Awareness: ${pctCh(a0, a1)} — driven by marketing reach and word of mouth.`);
  notes.push(`Choice share vs competitors: ${pctCh(c0, c1)} — driven by price, quality, brand and competitor moves.`);
  const lostUnits = signal(cur, 'Lost units (stockouts/capacity)');
  if (lostUnits > 0.5) notes.push(`${Math.round(lostUnits).toLocaleString('en-IN')} units of demand were lost to stockouts or capacity limits.`);
  if (cur.income.refunds > 0) notes.push(`Refunds reduced revenue by ₹${Math.round(cur.income.refunds).toLocaleString('en-IN')}.`);
  return { metric: 'revenue', title: 'Why did revenue change?', unit: 'inr', from: R0, to: R1, factors, notes, exact: true };
}

function explainProfit(cur: MonthlyReport, prev: MonthlyReport | null): Explanation {
  const i1 = cur.income;
  if (!prev) return { metric: 'profit', title: 'Net income this month', unit: 'inr', from: null, to: i1.netIncome, factors: [{ label: 'Net revenue', impact: i1.netRevenue }, { label: 'Cost of sales', impact: -i1.cogs }, { label: 'Operating expenses', impact: -i1.totalOpex }, { label: 'Depreciation', impact: -i1.depreciation }, { label: 'Interest', impact: -i1.interest }, { label: 'Other income', impact: i1.otherIncome }, { label: 'Tax', impact: -i1.tax }], notes: [], exact: true };
  const i0 = prev.income;
  const factors: ExplainFactor[] = [
    { label: 'Revenue', impact: i1.netRevenue - i0.netRevenue },
    { label: 'Cost of sales', impact: -(i1.cogs - i0.cogs) },
  ];
  const cats = new Set([...Object.keys(i1.opex), ...Object.keys(i0.opex)]);
  for (const c of cats) {
    const d = (i1.opex[c as keyof typeof i1.opex] ?? 0) - (i0.opex[c as keyof typeof i0.opex] ?? 0);
    if (Math.abs(d) > 0.5) factors.push({ label: OPEX_LABELS[c] ?? c, impact: -d });
  }
  factors.push({ label: 'Depreciation', impact: -(i1.depreciation - i0.depreciation) });
  factors.push({ label: 'Interest', impact: -(i1.interest - i0.interest) });
  factors.push({ label: 'Other income / gains', impact: i1.otherIncome - i0.otherIncome });
  factors.push({ label: 'Tax', impact: -(i1.tax - i0.tax) });
  return { metric: 'profit', title: 'Why did profit change?', unit: 'inr', from: i0.netIncome, to: i1.netIncome, factors: factors.filter((f) => Math.abs(f.impact) > 0.5), notes: ['Each bar is the change in that line item versus last month. They sum exactly to the change in net income.'], exact: true };
}

function explainCash(cur: MonthlyReport): Explanation {
  const cf = cur.cashflow;
  const factors: ExplainFactor[] = [];
  for (const kind of ['operating', 'investing', 'financing'] as const) {
    for (const [label, v] of Object.entries(cf.items[kind])) if (Math.abs(v) > 0.5) factors.push({ label: `${label} (${kind})`, impact: v });
  }
  factors.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
  const notes = [
    `Operating ₹${Math.round(cf.operating).toLocaleString('en-IN')}, investing ₹${Math.round(cf.investing).toLocaleString('en-IN')}, financing ₹${Math.round(cf.financing).toLocaleString('en-IN')}.`,
  ];
  if (cur.income.netIncome > 0 && cf.operating < 0) notes.push('Profitable but cash-negative: working capital (receivables, inventory) is absorbing cash.');
  return { metric: 'cash', title: 'Where did the cash go?', unit: 'inr', from: cf.beginCash, to: cf.endCash, factors, notes, exact: true };
}

function explainChurn(cur: MonthlyReport, prev: MonthlyReport | null): Explanation {
  const factors = (cur.drivers.churn ?? []).map((d) => ({ label: d.label, impact: (Math.exp(d.value) - 1) * 100, detail: `×${Math.exp(d.value).toFixed(2)} on the base churn rate` })).filter((f) => Math.abs(f.impact) > 0.1).sort((a, b) => b.impact - a.impact);
  return {
    metric: 'churn', title: 'What is driving churn?', unit: 'pct', from: prev ? prev.kpis.churnRate * 100 : null, to: cur.kpis.churnRate * 100, factors,
    notes: ['Each factor multiplies your industry base churn rate. Positive = pushes churn up.', 'Satisfaction is shaped by quality, value for money, support speed, availability and defects.'], exact: false,
  };
}

function explainCac(cur: MonthlyReport, prev: MonthlyReport | null): Explanation {
  const factors: ExplainFactor[] = [];
  const spend1 = cur.kpis.marketingSpend + (cur.breakdown.salaryByDept.sales ?? 0) + (cur.breakdown.salaryByDept.marketing ?? 0);
  const notes: string[] = [`CAC = (marketing spend + sales & marketing salaries) ÷ new customers = ₹${Math.round(spend1).toLocaleString('en-IN')} ÷ ${cur.kpis.newCustomers.toFixed(1)}.`];
  if (prev && prev.kpis.cac > 0 && cur.kpis.cac > 0) {
    const spend0 = prev.kpis.marketingSpend + (prev.breakdown.salaryByDept.sales ?? 0) + (prev.breakdown.salaryByDept.marketing ?? 0);
    const lnSpend = Math.log(Math.max(1, spend1) / Math.max(1, spend0));
    const lnNew = -Math.log(Math.max(0.01, cur.kpis.newCustomers) / Math.max(0.01, prev.kpis.newCustomers));
    const total = lnSpend + lnNew;
    const delta = cur.kpis.cac - prev.kpis.cac;
    if (Math.abs(total) > 1e-9) {
      factors.push({ label: 'Acquisition spend', impact: (delta * lnSpend) / total, detail: `₹${Math.round(spend0).toLocaleString('en-IN')} → ₹${Math.round(spend1).toLocaleString('en-IN')}` });
      factors.push({ label: 'New customers acquired', impact: (delta * lnNew) / total, detail: `${prev.kpis.newCustomers.toFixed(1)} → ${cur.kpis.newCustomers.toFixed(1)}` });
    }
  }
  for (const [ch, spend] of Object.entries(cur.breakdown.spendByChannel)) {
    const n = cur.breakdown.newByChannel[ch] ?? 0;
    if (spend > 0) notes.push(`${channelName(ch)}: ₹${Math.round(spend).toLocaleString('en-IN')} → ${n.toFixed(1)} customers (CAC ${n > 0.05 ? '₹' + Math.round(spend / n).toLocaleString('en-IN') : 'n/a'})`);
  }
  return { metric: 'cac', title: 'Why did CAC change?', unit: 'inr', from: prev?.kpis.cac ?? null, to: cur.kpis.cac, factors, notes, exact: true };
}

function explainCustomers(cur: MonthlyReport, prev: MonthlyReport | null): Explanation {
  const factors: ExplainFactor[] = Object.entries(cur.breakdown.newByChannel).map(([k, v]) => ({ label: `New via ${channelName(k)}`, impact: v })).sort((a, b) => b.impact - a.impact);
  factors.push({ label: 'Churned', impact: -cur.kpis.churned });
  const other = cur.kpis.customers - (prev?.kpis.customers ?? 0) - cur.kpis.newCustomers + cur.kpis.churned;
  if (prev && Math.abs(other) > 0.05) factors.push({ label: 'Other (acquisitions, exits, incidents)', impact: other });
  return { metric: 'customers', title: 'Where did customers come from?', unit: 'count', from: prev?.kpis.customers ?? null, to: cur.kpis.customers, factors: factors.filter((f) => Math.abs(f.impact) > 0.01), notes: [], exact: Boolean(prev) };
}

function explainList(metric: ExplainMetric, title: string, to: number, from: number | null, list: { label: string; value: number }[], unit: Explanation['unit'], note: string): Explanation {
  return { metric, title, unit, from, to, factors: list.map((d) => ({ label: d.label, impact: d.value })).sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)), notes: [note], exact: false };
}

function explainValuation(cur: MonthlyReport, prev: MonthlyReport | null): Explanation {
  const d = cur.drivers.valuation ?? [];
  const factors = d.map((x) => ({ label: x.label, impact: x.value, detail: x.detail }));
  return { metric: 'valuation', title: 'How is valuation computed?', unit: 'mult', from: prev?.kpis.valuation ?? null, to: cur.kpis.valuation, factors, notes: ['Valuation = revenue run-rate × industry multiple × growth × margin × funding climate × brand × PMF adjustments, floored by net assets / team value, and anchored near your last priced round.'], exact: false };
}

function explainShare(cur: MonthlyReport, prev: MonthlyReport | null): Explanation {
  const ours1 = cur.kpis.revenue;
  const comp1 = Object.values(cur.breakdown.competitorRevenue).reduce((a, b) => a + b, 0);
  const factors: ExplainFactor[] = [];
  if (prev) {
    const comp0 = Object.values(prev.breakdown.competitorRevenue).reduce((a, b) => a + b, 0);
    factors.push({ label: 'Our revenue growth', impact: prev.kpis.revenue > 0 ? (ours1 / prev.kpis.revenue - 1) * 100 : 0, detail: '% change' });
    factors.push({ label: 'Competitor revenue growth (served markets)', impact: comp0 > 0 ? (comp1 / comp0 - 1) * 100 : 0, detail: '% change' });
  }
  return { metric: 'marketShare', title: 'Why did market share move?', unit: 'pct', from: prev ? prev.kpis.marketShare * 100 : null, to: cur.kpis.marketShare * 100, factors, notes: ['Share = our revenue ÷ (our revenue + competitors’ revenue in the markets we serve). It rises when we grow faster than rivals.'], exact: false };
}

function explainMargin(cur: MonthlyReport, prev: MonthlyReport | null): Explanation {
  const r1 = cur.income.netRevenue || 1;
  const factors: ExplainFactor[] = Object.entries(cur.income.cogsBreakdown).filter(([, v]) => v !== 0).map(([k, v]) => ({ label: `${k.replace(/_/g, ' ')} (% of revenue)`, impact: -(v / r1) * 100 }));
  const notes: string[] = [];
  if (prev) {
    const r0 = prev.income.netRevenue || 1;
    for (const [k, v] of Object.entries(cur.income.cogsBreakdown)) {
      const before = (prev.income.cogsBreakdown[k as keyof typeof prev.income.cogsBreakdown] ?? 0) / r0;
      const after = v / r1;
      if (Math.abs(after - before) > 0.005) notes.push(`${k.replace(/_/g, ' ')}: ${(before * 100).toFixed(1)}% → ${(after * 100).toFixed(1)}% of revenue`);
    }
  }
  return { metric: 'grossMargin', title: 'What shapes gross margin?', unit: 'pct', from: prev ? prev.kpis.grossMargin * 100 : null, to: cur.kpis.grossMargin * 100, factors, notes, exact: false };
}

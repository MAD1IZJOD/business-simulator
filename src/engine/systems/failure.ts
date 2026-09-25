// Company failure detection with a clear, evidence-based explanation.
import type { SimState } from '../types';
import { difficultyOf, industryOf } from '../context';
import { overdraftLimit } from './loans';
import { founderOusted } from './board';
import { addNews } from './news';

const inr = (v: number) => (Math.abs(v) >= 1e7 ? `₹${(v / 1e7).toFixed(2)} Cr` : `₹${(v / 1e5).toFixed(1)} L`);

function explain(s: SimState): string[] {
  const out: string[] = [];
  const reps = s.reports.slice(-6);
  if (reps.length >= 2) {
    const burn = reps.map((r) => r.kpis.burn);
    out.push(`Average monthly burn over the last ${reps.length} months: ${inr(burn.reduce((a, b) => a + b, 0) / burn.length)}.`);
    const first = reps[0].kpis.revenue;
    const last = reps[reps.length - 1].kpis.revenue;
    out.push(`Revenue went from ${inr(first)} to ${inr(last)} per month.`);
    const lastInc = reps[reps.length - 1].income;
    const costs = Object.entries(lastInc.opex).sort((a, b) => b[1] - a[1]).slice(0, 3);
    out.push(`Largest costs last month: ${costs.map(([k, v]) => `${k} ${inr(v)}`).join(', ')}.`);
  }
  if (reps.length < 2) {
    const m = s.month;
    const costs = Object.values(m.opex).reduce((a, b) => a + b, 0) + Object.values(m.cogs).reduce((a, b) => a + b, 0);
    out.push(`Starting capital was ${inr(s.config.startingCapital)}.`);
    out.push(`Costs so far this month: ${inr(costs)} against revenue of ${inr(m.revenue)}.`);
    const payroll = s.employees.reduce((a, e) => a + e.salary, 0);
    out.push(`${s.employees.length} people on payroll costing about ${inr(payroll)} per month.`);
    const mk = Object.values(s.marketing.budgets).reduce((a, b) => a + b, 0);
    if (mk > 0) out.push(`Marketing budgets of ${inr(mk)} per month.`);
  }
  const debt = s.loans.filter((l) => l.status !== 'repaid').reduce((a, l) => a + l.balance, 0);
  if (debt > 0) out.push(`Outstanding debt: ${inr(debt)}.`);
  const bad = s.events.filter((e) => e.sentiment === 'negative' && s.day - e.day < 365).slice(0, 3);
  if (bad.length) out.push(`Recent setbacks: ${bad.map((e) => e.title).join('; ')}.`);
  if (s.macro.phase === 'recession') out.push('The economy was in recession.');
  return out;
}

export function checkFailure(s: SimState): void {
  if (s.status !== 'running') return;
  const diff = difficultyOf(s);
  const f = s.finance;
  const fail = (title: string, reason: string) => {
    s.status = 'ended';
    s.outcome = { kind: 'failure', day: s.day, title, reason, factors: explain(s), founderProceeds: 0 };
    addNews(s, `${s.company.name} shuts down`, reason, 'company', 'negative');
  };
  if (s.loans.some((l) => l.status === 'defaulted' && l.balance > 0) && f.cash <= 0) {
    fail('Debt default', 'The company defaulted on its loans and the lender forced it into insolvency.');
    return;
  }
  if (f.cash < 0) {
    f.overdraftMonths += 1;
    const limit = overdraftLimit(s);
    if (-f.cash > limit && f.overdraftMonths > diff.insolvencyGraceMonths) {
      fail('Insolvency', `Cash fell to ${inr(f.cash)}, beyond the overdraft facility of ${inr(limit)}, and stayed negative for ${f.overdraftMonths} month(s). The company could not pay its bills.`);
      return;
    }
    if (f.overdraftMonths > diff.insolvencyGraceMonths + 3) {
      fail('Sustained negative cash', `The company operated on overdraft for ${f.overdraftMonths} consecutive months and the bank closed the facility.`);
      return;
    }
  } else f.overdraftMonths = 0;
  const ind = industryOf(s);
  if (ind.regulation >= 0.8 && s.company.reputation.regulatory < 10) {
    fail('Regulatory shutdown', `Regulators revoked the company's licence after its regulatory standing collapsed to ${s.company.reputation.regulatory.toFixed(0)}/100. ${ind.name} is heavily regulated; legal counsel and compliance were insufficient.`);
    return;
  }
  if (founderOusted(s)) {
    s.status = 'ended';
    s.outcome = { kind: 'ousted', day: s.day, title: 'The board replaced you as CEO', reason: `Board confidence stayed below 25 for ${s.board.lowConfidenceMonths} months while investors controlled the company.`, factors: explain(s), founderProceeds: 0 };
    addNews(s, `${s.company.name}'s board replaces founder as CEO`, 'Investors lost confidence in the founder.', 'company', 'negative');
  }
}

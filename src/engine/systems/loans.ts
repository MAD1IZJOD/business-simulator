// Debt: bank term loans, venture debt, revolving credit and equipment financing.
// Amortizing payments, covenants (hard/brutal), missed payments and default.
import type { Covenant, Loan, LoanKind, SimState } from '../types';
import { difficultyOf } from '../context';
import { clamp, uid } from '../util';
import { moveCash, recordInterest, totalDebt, ppeValue } from './ledger';
import { addNews } from './news';
import { fundingClimate } from './macro';

export interface LoanOffer {
  kind: LoanKind;
  name: string;
  lender: string;
  maxAmount: number;
  rate: number;
  termMonths: number;
  available: boolean;
  reason: string;
  covenants: Covenant[];
}

function lastReports(s: SimState, n: number) {
  return s.reports.slice(-n);
}

export function trailingRevenue(s: SimState, months = 3): number {
  const r = lastReports(s, months);
  return r.length ? r.reduce((a, x) => a + x.income.netRevenue, 0) / r.length : 0;
}

export function trailingEbitda(s: SimState, months = 3): number {
  const r = lastReports(s, months);
  return r.length ? r.reduce((a, x) => a + x.income.ebitda, 0) / r.length : 0;
}

export function monthlyPayment(principal: number, annualRate: number, months: number): number {
  const r = annualRate / 1200;
  if (months <= 0) return principal;
  if (r <= 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

/** Risk spread over the policy rate from leverage, profitability and history. */
export function creditSpread(s: SimState): number {
  const rev = trailingRevenue(s);
  const ebitda = trailingEbitda(s);
  const debt = totalDebt(s);
  let spread = 4;
  if (ebitda <= 0) spread += 3;
  else spread += clamp((debt / (ebitda * 12)) - 1, 0, 4);
  if (rev <= 0) spread += 2;
  spread += s.loans.reduce((a, l) => a + l.missedPayments, 0) * 1.5;
  spread -= (s.company.reputation.investor - 50) / 50;
  if (s.macro.recessionKind === 'financial') spread += 3;
  return clamp(spread, 2, 14);
}

export function loanOffers(s: SimState): LoanOffer[] {
  const diff = difficultyOf(s);
  const policy = s.macro.interestRate;
  const spread = creditSpread(s);
  const rev = trailingRevenue(s);
  const ebitda = trailingEbitda(s);
  const climate = clamp(fundingClimate(s) * diff.financingEase, 0.2, 2);
  const lastVc = [...s.rounds].reverse().find((r) => ['seed', 'series_a', 'series_b', 'series_c', 'growth'].includes(r.kind));
  const equipment = s.finance.assets.filter((a) => a.category === 'equipment' || a.category === 'factory').reduce((a, x) => a + x.bookValue, 0);
  const cov = (hard: boolean): Covenant[] => (diff.covenants && hard ? [
    { kind: 'min_cash', threshold: Math.max(500000, rev * 1.5), breached: false, breachCount: 0 },
    { kind: 'max_leverage', threshold: 3.5, breached: false, breachCount: 0 },
    { kind: 'interest_coverage', threshold: 2, breached: false, breachCount: 0 },
  ] : []);
  const history = s.reports.length;
  const bankMax = Math.max(0, (rev * 6 + ppeValue(s) * 0.5 + Math.max(0, ebitda) * 18) * climate);
  const revolverUsed = s.loans.filter((l) => l.kind === 'revolver' && l.status === 'active').reduce((a, l) => a + l.balance, 0);
  return [
    {
      kind: 'bank', name: 'Bank term loan', lender: 'Sahyadri Bank', termMonths: 36, rate: policy + spread,
      maxAmount: history >= 6 && rev > 0 ? bankMax : 0,
      available: history >= 6 && rev > 0 && bankMax > 100000,
      reason: history < 6 ? 'Banks want 6 months of financial history.' : rev <= 0 ? 'No revenue to lend against.' : 'Secured on revenue and assets.',
      covenants: cov(true),
    },
    {
      kind: 'venture_debt', name: 'Venture debt', lender: 'Trifecta Venture Debt', termMonths: 36, rate: policy + 7 + Math.max(0, spread - 6),
      maxAmount: lastVc && s.day - lastVc.day < 540 ? lastVc.amount * 0.3 * climate : 0,
      available: !!lastVc && s.day - lastVc.day < 540,
      reason: lastVc ? 'Sized at ~30% of your last venture round.' : 'Requires a venture round in the last 18 months.',
      covenants: cov(true).slice(0, 1),
    },
    {
      kind: 'revolver', name: 'Revolving credit line', lender: 'Sahyadri Bank', termMonths: 12, rate: policy + spread + 1,
      maxAmount: history >= 3 && rev > 0 ? Math.max(0, rev * 1.5 * climate - revolverUsed) : 0,
      available: history >= 3 && rev > 0,
      reason: history < 3 ? 'Needs 3 months of revenue history.' : 'Draw and repay anytime; interest only on what you use.',
      covenants: cov(true).slice(0, 1),
    },
    {
      kind: 'equipment', name: 'Equipment financing', lender: 'Assetline Leasing', termMonths: 60, rate: policy + 3.5,
      maxAmount: equipment * 0.7 * climate,
      available: equipment > 500000,
      reason: equipment > 500000 ? 'Secured on your equipment and factories.' : 'Requires financeable equipment.',
      covenants: [],
    },
  ];
}

export function takeLoan(s: SimState, kind: LoanKind, amount: number, termOverride?: number): { ok: boolean; message: string } {
  const offer = loanOffers(s).find((o) => o.kind === kind);
  if (!offer || !offer.available) return { ok: false, message: offer?.reason ?? 'Not available.' };
  amount = Math.floor(amount);
  if (amount <= 0) return { ok: false, message: 'Enter an amount.' };
  if (amount > offer.maxAmount) return { ok: false, message: `The lender will lend at most ₹${Math.round(offer.maxAmount).toLocaleString('en-IN')}.` };
  const term = termOverride ?? offer.termMonths;
  const loan: Loan = {
    id: uid(s, 'l'),
    kind,
    lender: offer.lender,
    principal: amount,
    balance: amount,
    limit: kind === 'revolver' ? amount : 0,
    rate: offer.rate,
    termMonths: term,
    monthsRemaining: term,
    monthlyPayment: kind === 'revolver' ? 0 : monthlyPayment(amount, offer.rate, term),
    startDay: s.day,
    missedPayments: 0,
    covenants: offer.covenants.map((c) => ({ ...c })),
    status: 'active',
  };
  s.loans.push(loan);
  moveCash(s, amount, 'financing', 'Loan proceeds');
  addNews(s, `${s.company.name} takes on ₹${(amount / 1e5).toFixed(1)} lakh of ${offer.name.toLowerCase()}`, `At ${offer.rate.toFixed(1)}% over ${term} months.`, 'company', 'neutral');
  return { ok: true, message: `Borrowed ₹${amount.toLocaleString('en-IN')} at ${offer.rate.toFixed(1)}%.` };
}

export function repayLoan(s: SimState, id: string, amount: number): { ok: boolean; message: string } {
  const l = s.loans.find((x) => x.id === id);
  if (!l || l.status !== 'active') return { ok: false, message: 'Loan not found.' };
  const pay = Math.min(amount, l.balance, Math.max(0, s.finance.cash));
  if (pay <= 0) return { ok: false, message: 'No cash available to repay.' };
  l.balance -= pay;
  moveCash(s, -pay, 'financing', 'Loan repayments');
  if (l.balance <= 1) {
    l.balance = 0;
    l.status = 'repaid';
  } else if (l.kind !== 'revolver' && l.monthsRemaining > 0) {
    l.monthlyPayment = monthlyPayment(l.balance, l.rate, l.monthsRemaining);
  }
  return { ok: true, message: `Repaid ₹${Math.round(pay).toLocaleString('en-IN')}.` };
}

/** Cash available including the overdraft facility (months of fixed cost by difficulty). */
export function overdraftLimit(s: SimState): number {
  const diff = difficultyOf(s);
  const last = s.reports[s.reports.length - 1];
  const fixed = last ? last.income.totalOpex : 500000;
  return diff.overdraftMonths * fixed;
}

/** Monthly: interest, amortization, missed payments, default, covenants, overdraft interest. */
export function monthlyLoans(s: SimState): void {
  const diff = difficultyOf(s);
  for (const l of s.loans) {
    if (l.status !== 'active') continue;
    const interest = (l.balance * l.rate) / 1200;
    const principal = l.kind === 'revolver' ? 0 : Math.max(0, Math.min(l.balance, l.monthlyPayment - interest));
    const due = interest + principal;
    const available = s.finance.cash + overdraftLimit(s);
    if (available < due) {
      l.missedPayments += 1;
      l.rate += 2;
      s.company.reputation.investor = clamp(s.company.reputation.investor - 8, 0, 100);
      addNews(s, `${s.company.name} misses a loan payment`, `${l.lender} applies a 2% penalty rate. Another miss means default.`, 'company', 'negative');
      recordInterest(s, interest);
      l.balance += interest; // capitalized
      if (l.missedPayments >= 2) {
        l.status = 'defaulted';
        addNews(s, `${s.company.name} defaults on its ${l.lender} loan`, 'The lender demands immediate repayment of the full balance.', 'company', 'negative');
      }
      continue;
    }
    recordInterest(s, interest);
    moveCash(s, -interest, 'operating', 'Interest paid');
    if (principal > 0) {
      l.balance -= principal;
      moveCash(s, -principal, 'financing', 'Loan repayments');
    }
    l.monthsRemaining -= 1;
    if (l.kind === 'revolver' && l.monthsRemaining <= 0) l.monthsRemaining = 12; // auto-renewed
    if (l.balance <= 1 || (l.kind !== 'revolver' && l.monthsRemaining <= 0)) {
      if (l.balance > 1) {
        moveCash(s, -l.balance, 'financing', 'Loan repayments');
      }
      l.balance = 0;
      l.status = 'repaid';
      continue;
    }
    // Covenants
    if (diff.covenants && l.covenants.length) {
      const ebitda = trailingEbitda(s, 3) * 12;
      const debt = totalDebt(s);
      const monthlyInterest = s.loans.filter((x) => x.status === 'active').reduce((a, x) => a + (x.balance * x.rate) / 1200, 0);
      for (const c of l.covenants) {
        let ok = true;
        if (c.kind === 'min_cash') ok = s.finance.cash >= c.threshold;
        if (c.kind === 'max_leverage') ok = debt <= 0 || (ebitda > 0 && debt / ebitda <= c.threshold);
        if (c.kind === 'interest_coverage') ok = monthlyInterest <= 0 || (ebitda / 12) / monthlyInterest >= c.threshold;
        if (!ok && s.reports.length >= 3) {
          c.breached = true;
          c.breachCount += 1;
          l.rate += 1;
          s.company.reputation.investor = clamp(s.company.reputation.investor - 4, 0, 100);
          addNews(s, `Covenant breach at ${s.company.name}`, `${c.kind.replace('_', ' ')} covenant on the ${l.lender} loan was breached. Rate +1%.`, 'company', 'negative');
          if (s.config.difficulty === 'brutal' && c.breachCount >= 2) {
            l.status = 'defaulted';
            addNews(s, `${l.lender} calls its loan`, 'Repeated covenant breaches trigger acceleration: the full balance is due now.', 'company', 'negative');
          }
        } else c.breached = false;
      }
    }
  }
  // Defaulted loans: lender takes whatever cash exists.
  for (const l of s.loans) {
    if (l.status !== 'defaulted' || l.balance <= 0) continue;
    const pay = Math.min(l.balance, Math.max(0, s.finance.cash));
    if (pay > 0) {
      l.balance -= pay;
      moveCash(s, -pay, 'financing', 'Loan repayments');
    }
    if (l.balance <= 1) { l.balance = 0; l.status = 'repaid'; }
  }
  // Overdraft interest.
  if (s.finance.cash < 0) {
    const i = (-s.finance.cash * (s.macro.interestRate + 9)) / 1200;
    recordInterest(s, i);
    moveCash(s, -i, 'operating', 'Overdraft interest');
  }
}

export function upcomingLoanPayments(s: SimState): number {
  return s.loans.filter((l) => l.status === 'active').reduce((a, l) => a + (l.kind === 'revolver' ? (l.balance * l.rate) / 1200 : l.monthlyPayment), 0);
}

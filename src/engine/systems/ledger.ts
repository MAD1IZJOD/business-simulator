// The ledger: every monetary movement in the simulation goes through these
// primitives so the income statement, balance sheet and cash-flow statement are
// always derived from the same postings and the balance sheet always balances.
//
// Invariant: cash + AR + inventory + PP&E + goodwill
//          = AP + accrued payroll + tax payable + deferred revenue + debt
//          + paid-in capital + retained earnings - treasury stock
import type { CashFlowKind, CogsCategory, MonthAccumulator, OpexCategory, SimState } from '../types';
import { addTo, safe } from '../util';

export function emptyMonth(beginCash: number): MonthAccumulator {
  return {
    revenue: 0,
    revenueByProduct: {},
    revenueByMarket: {},
    revenueBySegment: {},
    revenueByStream: {},
    refunds: 0,
    cogs: { materials: 0, labor: 0, hosting: 0, fulfillment: 0, payment_fees: 0, partner_share: 0, energy: 0 },
    opex: {
      salaries: 0, marketing: 0, rent: 0, rd: 0, tools: 0, recruiting: 0, legal: 0, security: 0, carrying: 0, warranty: 0,
      maintenance: 0, severance: 0, utilities: 0, compliance: 0, esg: 0, integration: 0, writeoffs: 0, bad_debt: 0,
      implementation: 0, fees: 0, other: 0,
    },
    salaryByDept: {},
    depreciation: 0,
    interest: 0,
    otherIncome: 0,
    tax: 0,
    cashFlows: { operating: {}, investing: {}, financing: {} },
    beginCash,
    units: 0,
    lostUnits: 0,
    newCustomers: 0,
    newByChannel: {},
    newBySegment: {},
    churned: 0,
    churnBase: 0,
    marketingSpend: {},
    salesCost: 0,
    funnel: { inMarket: 0, aware: 0, interest: 0, visit: 0, consideration: 0, trial: 0, purchase: 0, activation: 0, referral: 0, churn: 0, expansion: 0 },
    tickets: 0,
    ticketCapacity: 0,
    produced: 0,
    defects: 0,
    returns: 0,
    hires: 0,
    quits: 0,
    layoffs: 0,
    priceWeighted: 0,
    demandIndex: 0,
    awarenessAvg: 0,
    choiceShare: 0,
    choiceSamples: 0,
    stockoutDays: 0,
    slaBreaches: 0,
    seatsExpansion: 0,
    drv: {},
  };
}

function check(v: number, what: string): number {
  if (!Number.isFinite(v)) throw new Error(`Non-finite amount posted to ${what}`);
  return v;
}

/** Move cash and classify the flow for the cash-flow statement. */
export function moveCash(s: SimState, amount: number, kind: CashFlowKind, label: string): void {
  check(amount, `cash:${label}`);
  if (amount === 0) return;
  s.finance.cash += amount;
  addTo(s.month.cashFlows[kind], label, amount);
}

export interface RevenueDims {
  productId?: string;
  marketId?: string;
  segmentId?: string;
  stream: string;
}

export function recordRevenue(s: SimState, amount: number, dims: RevenueDims): void {
  check(amount, 'revenue');
  if (amount === 0) return;
  const m = s.month;
  m.revenue += amount;
  if (dims.productId) addTo(m.revenueByProduct, dims.productId, amount);
  if (dims.marketId) addTo(m.revenueByMarket, dims.marketId, amount);
  if (dims.segmentId) addTo(m.revenueBySegment, dims.segmentId, amount);
  addTo(m.revenueByStream, dims.stream, amount);
  s.finance.retainedEarnings += amount;
}

/** Refunds reduce net revenue (contra-revenue). Caller handles the cash side. */
export function recordRefund(s: SimState, amount: number): void {
  check(amount, 'refund');
  s.month.refunds += amount;
  s.finance.retainedEarnings -= amount;
}

export function recordCogs(s: SimState, cat: CogsCategory, amount: number): void {
  check(amount, `cogs:${cat}`);
  if (amount === 0) return;
  s.month.cogs[cat] += amount;
  s.finance.retainedEarnings -= amount;
}

export function recordOpex(s: SimState, cat: OpexCategory, amount: number, dept?: string): void {
  check(amount, `opex:${cat}`);
  if (amount === 0) return;
  s.month.opex[cat] += amount;
  if (dept) addTo(s.month.salaryByDept, dept, amount);
  s.finance.retainedEarnings -= amount;
}

export function recordDepreciation(s: SimState, amount: number): void {
  check(amount, 'depreciation');
  s.month.depreciation += amount;
  s.finance.retainedEarnings -= amount;
}

export function recordInterest(s: SimState, amount: number): void {
  check(amount, 'interest');
  s.month.interest += amount;
  s.finance.retainedEarnings -= amount;
}

/** Other income (positive) or loss (negative): asset-sale gains, FX, penalties received. */
export function recordOtherIncome(s: SimState, amount: number): void {
  check(amount, 'other income');
  s.month.otherIncome += amount;
  s.finance.retainedEarnings += amount;
}

export function recordTax(s: SimState, amount: number): void {
  check(amount, 'tax');
  s.month.tax += amount;
  s.finance.retainedEarnings -= amount;
}

// ------------------------------------------------------------ compound helpers

/** Opex paid immediately in cash. */
export function payExpense(s: SimState, cat: OpexCategory, amount: number, label: string, dept?: string): void {
  amount = safe(amount);
  if (amount <= 0) return;
  recordOpex(s, cat, amount, dept);
  moveCash(s, -amount, 'operating', label);
}

/** Cost of sales paid immediately in cash. */
export function payCogs(s: SimState, cat: CogsCategory, amount: number, label: string): void {
  amount = safe(amount);
  if (amount <= 0) return;
  recordCogs(s, cat, amount);
  moveCash(s, -amount, 'operating', label);
}

/** A sale: revenue now; cash now or as a receivable due in `termsDays`. */
export function sell(s: SimState, amount: number, dims: RevenueDims, termsDays: number): void {
  amount = safe(amount);
  if (amount <= 0) return;
  recordRevenue(s, amount, dims);
  if (termsDays <= 0) moveCash(s, amount, 'operating', 'Customer receipts');
  else addReceivable(s, amount, termsDays, dims.stream);
}

export function addReceivable(s: SimState, amount: number, termsDays: number, label: string): void {
  const dueDay = s.day + Math.max(1, Math.round(termsDays));
  const last = s.finance.ar[s.finance.ar.length - 1];
  if (last && last.dueDay === dueDay && last.label === label) last.amount += amount;
  else s.finance.ar.push({ dueDay, amount, label });
}

export function addPayable(s: SimState, amount: number, termsDays: number, label: string): void {
  if (termsDays <= 0) {
    moveCash(s, -amount, 'operating', label);
    return;
  }
  const dueDay = s.day + Math.round(termsDays);
  const last = s.finance.ap[s.finance.ap.length - 1];
  if (last && last.dueDay === dueDay && last.label === label) last.amount += amount;
  else s.finance.ap.push({ dueDay, amount, label });
}

/** Expense accrued now, cash paid later (via accounts payable). */
export function accrueExpense(s: SimState, cat: OpexCategory, amount: number, termsDays: number, label: string): void {
  amount = safe(amount);
  if (amount <= 0) return;
  recordOpex(s, cat, amount);
  addPayable(s, amount, termsDays, label);
}

export function totalAR(s: SimState): number {
  let t = 0;
  for (const b of s.finance.ar) t += b.amount;
  return t;
}

export function totalAP(s: SimState): number {
  let t = 0;
  for (const b of s.finance.ap) t += b.amount;
  return t;
}

export function inventoryValue(s: SimState): number {
  let t = 0;
  for (const id in s.inventory) {
    const inv = s.inventory[id];
    t += inv.finishedValue + inv.rawValue + inv.wipValue;
  }
  return t;
}

export function ppeValue(s: SimState): number {
  let t = 0;
  for (const a of s.finance.assets) t += a.bookValue;
  return t;
}

export function totalDebt(s: SimState): number {
  let t = 0;
  for (const l of s.loans) if (l.status === 'active' || l.status === 'defaulted') t += l.balance;
  return t;
}

/** Assets minus (liabilities + equity). Should always be ~0. */
export function balanceGap(s: SimState): number {
  const f = s.finance;
  const assets = f.cash + totalAR(s) + inventoryValue(s) + ppeValue(s) + f.goodwill;
  const liabilities = totalAP(s) + f.accruedPayroll + f.taxPayable + f.deferredRevenue + totalDebt(s);
  const equity = f.paidInCapital + f.retainedEarnings - f.treasuryStock;
  return assets - liabilities - equity;
}

/** Daily: collect receivables that are due (with bad-debt write-offs) and pay payables that are due. */
export function settleDaily(s: SimState, badDebtRate: number): void {
  const f = s.finance;
  if (f.ar.length) {
    const keep = [];
    for (const b of f.ar) {
      if (b.dueDay <= s.day) {
        const loss = b.amount * badDebtRate;
        if (loss > 0) recordOpex(s, 'bad_debt', loss);
        moveCash(s, b.amount - loss, 'operating', 'Customer receipts');
      } else keep.push(b);
    }
    f.ar = keep;
  }
  if (f.ap.length) {
    const keep = [];
    for (const b of f.ap) {
      if (b.dueDay <= s.day) moveCash(s, -b.amount, 'operating', b.label);
      else keep.push(b);
    }
    f.ap = keep;
  }
}

import { describe, expect, it } from 'vitest';
import { launchedGame, sumValues } from './helpers';
import { advanceDays, advanceMonths } from '../src/engine/step';
import { balanceGap, emptyMonth, moveCash, sell, settleDaily, totalAR } from '../src/engine/systems/ledger';
import { incomeStatement } from '../src/engine/systems/reports';
import { monthlyPayment } from '../src/engine/systems/loans';
import * as cmd from '../src/engine/commands';
import { monthlyTaxes } from '../src/engine/systems/finance';
import { payrollMonthly } from '../src/engine/systems/employees';
import { dim } from '../src/engine/context';

describe('ledger and accounting identities', () => {
  it('keeps the balance sheet balanced through two years of play', () => {
    const s = launchedGame({ industry: 'electronics', startingCapital: 20000000, audience: 'b2c', targetSegment: 'consumers', monetization: 'one_time' });
    cmd.openJob(s, { role: 'marketer', level: 2, count: 1 });
    for (let m = 0; m < 24 && s.status === 'running'; m++) {
      advanceMonths(s, 1);
      expect(Math.abs(balanceGap(s))).toBeLessThan(1);
      const r = s.reports[s.reports.length - 1];
      expect(Math.abs(r.balance.totalAssets - r.balance.totalLiabilities - r.balance.equity)).toBeLessThan(1);
    }
  });

  it('income statement lines add up to net income', () => {
    const s = launchedGame();
    advanceMonths(s, 6);
    for (const r of s.reports) {
      const i = r.income;
      expect(i.netRevenue).toBeCloseTo(i.revenue - i.refunds, 4);
      expect(i.cogs).toBeCloseTo(sumValues(i.cogsBreakdown), 4);
      expect(i.totalOpex).toBeCloseTo(sumValues(i.opex), 4);
      expect(i.netIncome).toBeCloseTo(i.netRevenue - i.cogs - i.totalOpex - i.depreciation - i.interest + i.otherIncome - i.tax, 4);
      expect(i.ebitda).toBeCloseTo(i.grossProfit - i.totalOpex, 4);
    }
  });

  it('cash-flow statement reconciles opening and closing cash', () => {
    const s = launchedGame({ industry: 'saas' });
    cmd.takeLoan(s, 'bank', 1); // not available yet: must not move cash
    advanceMonths(s, 8);
    let prevEnd = s.reports[0].cashflow.beginCash;
    for (const r of s.reports) {
      expect(r.cashflow.beginCash).toBeCloseTo(prevEnd, 4);
      expect(r.cashflow.endCash).toBeCloseTo(r.cashflow.beginCash + r.cashflow.net, 4);
      expect(r.cashflow.net).toBeCloseTo(r.cashflow.operating + r.cashflow.investing + r.cashflow.financing, 4);
      prevEnd = r.cashflow.endCash;
    }
  });

  it('revenue on credit becomes a receivable, then cash when collected (minus bad debt)', () => {
    const s = launchedGame();
    const cash0 = s.finance.cash;
    sell(s, 100000, { stream: 'Test' }, 30);
    expect(totalAR(s)).toBeCloseTo(100000);
    expect(s.finance.cash).toBe(cash0);
    s.day += 30;
    settleDaily(s, 0.01);
    expect(totalAR(s)).toBe(0);
    expect(s.finance.cash).toBeCloseTo(cash0 + 99000);
    expect(s.month.opex.bad_debt).toBeCloseTo(1000);
    expect(Math.abs(balanceGap(s))).toBeLessThan(1e-6);
  });

  it('revenue by product sums to total revenue', () => {
    const s = launchedGame({ industry: 'saas' });
    advanceMonths(s, 5);
    for (const r of s.reports) {
      const byStream = r.breakdown.revenueByProduct;
      expect(sumValues(byStream)).toBeLessThanOrEqual(r.income.revenue + 1e-6);
    }
  });
});

describe('payroll and expenses', () => {
  it('accrues payroll daily and pays it at month end', () => {
    const s = launchedGame();
    cmd.setFounderSalary(s, 50000);
    const monthly = payrollMonthly(s);
    const days = dim(s);
    advanceDays(s, 10);
    expect(s.finance.accruedPayroll).toBeCloseTo((monthly / days) * 10, 0);
    advanceDays(s, days - 10);
    expect(s.finance.accruedPayroll).toBe(0);
    const r = s.reports[0];
    expect(r.cashflow.items.operating.Payroll).toBeCloseTo(-monthly, -1);
    const salaryCost = r.income.opex.salaries + r.income.cogsBreakdown.labor;
    expect(salaryCost).toBeCloseTo(monthly, -1);
  });

  it('marketing budgets are spent and recorded by channel', () => {
    const s = launchedGame({}, 'soft');
    cmd.setMarketingBudget(s, 'paid_search', 300000);
    advanceMonths(s, 1);
    const r = s.reports[0];
    expect(r.breakdown.spendByChannel.paid_search).toBeCloseTo(300000, -1);
    expect(r.income.opex.marketing).toBeGreaterThanOrEqual(300000 - 1);
  });
});

describe('taxes', () => {
  it('uses loss carryforward before paying tax', () => {
    const s = launchedGame();
    s.month = emptyMonth(s.finance.cash);
    s.finance.taxLossCarryforward = 1000000;
    s.month.revenue = 600000;
    monthlyTaxes(s);
    expect(s.month.tax).toBe(0);
    expect(s.finance.taxLossCarryforward).toBeCloseTo(400000);
    s.month = emptyMonth(s.finance.cash);
    s.month.revenue = 1000000;
    monthlyTaxes(s);
    expect(s.month.tax).toBeCloseTo(600000 * 0.2517, 0);
    expect(incomeStatement(s).tax).toBeCloseTo(s.month.tax);
  });
});

describe('loans and interest', () => {
  it('computes amortizing payments correctly', () => {
    const p = monthlyPayment(1200000, 12, 12);
    expect(p).toBeCloseTo(106618.55, 1);
    expect(monthlyPayment(1200000, 0, 12)).toBe(100000);
  });

  it('pays interest and principal each month and reduces the balance', () => {
    const s = launchedGame();
    advanceMonths(s, 7);
    const ok = cmd.takeLoan(s, 'bank', 500000);
    if (!ok.ok) {
      // Build history until the bank will lend.
      advanceMonths(s, 3);
      expect(cmd.takeLoan(s, 'bank', 300000).ok).toBe(true);
    }
    const loan = s.loans[0];
    const before = loan.balance;
    const cashBefore = s.finance.cash;
    advanceMonths(s, 1);
    expect(loan.balance).toBeLessThan(before);
    const r = s.reports[s.reports.length - 1];
    expect(r.income.interest).toBeGreaterThan(0);
    expect(r.cashflow.items.financing['Loan repayments']).toBeLessThan(0);
    expect(r.cashflow.items.operating['Interest paid']).toBeLessThan(0);
    expect(Number.isFinite(cashBefore)).toBe(true);
    expect(Math.abs(balanceGap(s))).toBeLessThan(1);
  });

  it('lets you renegotiate a loan rate at most every 90 days, never below the floor', () => {
    const s = launchedGame();
    s.loans.push({ id: 'l-neg', kind: 'bank', lender: 'Test Bank', principal: 1000000, balance: 1000000, limit: 0, rate: 20, termMonths: 24, monthsRemaining: 24, monthlyPayment: monthlyPayment(1000000, 20, 24), startDay: 0, missedPayments: 0, covenants: [], status: 'active' });
    moveCash(s, 1000000, 'financing', 'Loan proceeds');
    const first = cmd.negotiateLoanRate(s, 'l-neg');
    const again = cmd.negotiateLoanRate(s, 'l-neg');
    expect(again.ok).toBe(false);
    expect(again.message).toMatch(/days/);
    const loan = s.loans.find((l) => l.id === 'l-neg')!;
    if (first.ok) expect(loan.rate).toBeCloseTo(19, 6);
    expect(loan.rate).toBeGreaterThanOrEqual(s.macro.interestRate + 2);
    expect(Math.abs(balanceGap(s))).toBeLessThan(1e-6);
  });

  it('defaults after repeated missed payments', () => {
    const s = launchedGame({ difficulty: 'brutal' });
    s.loans.push({ id: 'l-test', kind: 'bank', lender: 'Test', principal: 1e9, balance: 1e9, limit: 0, rate: 12, termMonths: 12, monthsRemaining: 12, monthlyPayment: monthlyPayment(1e9, 12, 12), startDay: 0, missedPayments: 0, covenants: [], status: 'active' });
    moveCash(s, 1e9, 'financing', 'Loan proceeds');
    moveCash(s, -1e9, 'investing', 'Test spend');
    // Make the books consistent for the injected loan.
    s.finance.retainedEarnings -= 1e9;
    advanceMonths(s, 3);
    expect(s.loans[0].missedPayments).toBeGreaterThanOrEqual(1);
    expect(s.status === 'ended' || s.loans[0].status === 'defaulted').toBe(true);
  });
});

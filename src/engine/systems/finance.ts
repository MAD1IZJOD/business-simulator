// Month-end finance: tax accrual with loss carryforward, quarterly tax payment,
// dividends and share buybacks.
import type { SimState } from '../types';
import { corporateTaxRate } from '../context';
import { currentDate } from '../calendar';
import { moveCash, recordTax } from './ledger';
import { addNews } from './news';

/** Earnings before tax for the current month accumulator. */
export function monthEbt(s: SimState): number {
  const m = s.month;
  const cogs = Object.values(m.cogs).reduce((a, b) => a + b, 0);
  const opex = Object.values(m.opex).reduce((a, b) => a + b, 0);
  return m.revenue - m.refunds - cogs - opex - m.depreciation - m.interest + m.otherIncome;
}

export function monthlyTaxes(s: SimState): void {
  const ebt = monthEbt(s);
  const f = s.finance;
  if (ebt > 0) {
    const offset = Math.min(f.taxLossCarryforward, ebt);
    f.taxLossCarryforward -= offset;
    const tax = (ebt - offset) * corporateTaxRate(s);
    if (tax > 0) {
      recordTax(s, tax);
      f.taxPayable += tax;
    }
  } else if (ebt < 0) {
    f.taxLossCarryforward += -ebt;
  }
  const month = currentDate(s).month;
  if (month % 3 === 0 && f.taxPayable > 0) {
    moveCash(s, -f.taxPayable, 'operating', 'Taxes paid');
    f.taxPayable = 0;
  }
}

function publicHolder(s: SimState) {
  return s.capTable.find((h) => h.kind === 'public');
}

export function monthlyShareholderReturns(s: SimState): void {
  const f = s.finance;
  const stock = s.stock;
  if (!s.company.isPublic || !stock) return;
  const month = currentDate(s).month;
  const shares = s.capTable.reduce((a, h) => a + h.shares, 0);
  if (month % 3 === 0 && f.dividendPolicy.perShareQuarterly > 0) {
    const total = f.dividendPolicy.perShareQuarterly * shares;
    if (s.finance.cash > total * 1.5) {
      moveCash(s, -total, 'financing', 'Dividends paid');
      f.retainedEarnings -= total;
      f.dividendsPaid += total;
      addNews(s, `${s.company.name} pays a dividend of ₹${f.dividendPolicy.perShareQuarterly.toFixed(2)} per share`, `Total payout ₹${(total / 1e7).toFixed(2)} Cr.`, 'company', 'positive');
    }
  }
  if (f.buybackBudget > 0 && stock.price > 0) {
    const holder = publicHolder(s);
    const budget = Math.min(f.buybackBudget, Math.max(0, s.finance.cash * 0.3));
    if (holder && budget > 0) {
      const n = Math.min(holder.shares * 0.5, Math.floor(budget / stock.price));
      const cost = n * stock.price;
      if (n > 0) {
        holder.shares -= n;
        stock.sharesOutstanding -= n;
        f.treasuryStock += cost;
        moveCash(s, -cost, 'financing', 'Share buybacks');
      }
    }
  }
}

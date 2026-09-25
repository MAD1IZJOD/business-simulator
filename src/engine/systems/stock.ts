// IPO and public-market stock simulation. The share price random-walks around a
// fundamental value, tracks the market index, and jumps on earnings surprises.
import type { SimState } from '../types';
import { roleCapacity, totalShares } from '../context';
import { currentDate } from '../calendar';
import { randNormal } from '../rng';
import { clamp } from '../util';
import { moveCash, payExpense } from './ledger';
import { addNews } from './news';
import { computeValuation } from './valuation';
import { fundingClimate } from './macro';

export const IPO_MIN_RUN_RATE = 1_000_000_000; // ₹100 Cr

export interface IpoCheck { label: string; ok: boolean; detail: string }

export function ipoReadiness(s: SimState): IpoCheck[] {
  const v = computeValuation(s, false);
  const last12 = s.reports.slice(-12);
  const profitable = last12.length >= 3 && last12.slice(-3).reduce((a, r) => a + r.income.ebitda, 0) > 0;
  return [
    { label: 'Revenue run-rate ≥ ₹100 Cr', ok: v.runRate >= IPO_MIN_RUN_RATE, detail: `₹${(v.runRate / 1e7).toFixed(1)} Cr` },
    { label: '18+ months of audited history', ok: s.reports.length >= 18, detail: `${s.reports.length} months` },
    { label: 'Growing >15% or EBITDA positive', ok: v.growth > 0.15 || profitable, detail: `${(v.growth * 100).toFixed(0)}% growth, EBITDA ${profitable ? 'positive' : 'negative'}` },
    { label: 'Finance team of 4+', ok: roleCapacity(s, 'finance_analyst') >= 3.2, detail: `${s.employees.filter((e) => e.role === 'finance_analyst').length} analysts` },
    { label: 'Legal counsel on staff', ok: s.employees.some((e) => e.role === 'lawyer'), detail: '' },
    { label: 'Public markets receptive', ok: fundingClimate(s) > 0.6 && s.macro.marketIndex > 700, detail: `Index ${s.macro.marketIndex.toFixed(0)}` },
  ];
}

export function startIpo(s: SimState): { ok: boolean; message: string } {
  if (s.company.isPublic) return { ok: false, message: 'Already public.' };
  if (s.ipo) return { ok: false, message: 'IPO already in preparation.' };
  const failed = ipoReadiness(s).filter((c) => !c.ok);
  if (failed.length) return { ok: false, message: `Not ready: ${failed.map((f) => f.label).join('; ')}.` };
  if (s.board.approvalsRequired && s.board.confidence < 40) return { ok: false, message: 'The board will not approve an IPO at current confidence.' };
  const cost = 30_000_000;
  payExpense(s, 'fees', cost, 'IPO preparation (bankers, auditors, lawyers)');
  s.ipo = { startedDay: s.day, readyDay: s.day + 120, cost, targetRaise: computeValuation(s, false).value * 0.15 };
  addNews(s, `${s.company.name} files for an IPO`, 'Bankers begin the roadshow. Listing expected in about four months.', 'company', 'positive');
  return { ok: true, message: 'IPO preparation started. Listing in ~120 days if markets cooperate.' };
}

export function completeIpo(s: SimState): void {
  const ipo = s.ipo;
  if (!ipo || s.day < ipo.readyDay) return;
  s.ipo = null;
  const climate = fundingClimate(s);
  if (climate < 0.45 || s.macro.marketIndex < 600) {
    addNews(s, `${s.company.name} postpones its IPO`, 'Market conditions deteriorated. Preparation costs are sunk.', 'company', 'negative');
    return;
  }
  const fundamental = computeValuation(s, false).value;
  const sentiment = clamp(Math.sqrt(s.macro.marketIndex / 1000) * climate, 0.6, 1.5);
  const preMoney = fundamental * sentiment * 0.9;
  const before = totalShares(s);
  const price = preMoney / before;
  const newShares = Math.round((preMoney * 0.15) / price);
  const gross = newShares * price;
  const fee = gross * 0.05;
  s.capTable.push({ id: `pub-${s.day}`, name: 'Public shareholders', kind: 'public', shares: newShares, invested: gross, round: 'IPO' });
  // Underwriting fees are an equity issuance cost: they reduce paid-in capital.
  s.finance.paidInCapital += gross - fee;
  moveCash(s, gross - fee, 'financing', 'IPO proceeds (net of fees)');
  s.company.isPublic = true;
  s.stock = { ipoDay: s.day, ipoPrice: price, price, sharesOutstanding: before + newShares, history: [{ day: s.day, price }], consensusEps: 0, lastEps: 0, analystRating: 'buy', sentiment: 0.2 };
  s.rounds.push({ kind: 'growth', day: s.day, amount: gross, preMoney, postMoney: preMoney + gross, pricePerShare: price, newShares, investors: ['IPO'] });
  addNews(s, `${s.company.name} lists on the stock exchange`, `Priced at ₹${price.toFixed(2)} per share, raising ₹${(gross / 1e7).toFixed(0)} Cr at a ₹${((preMoney + gross) / 1e7).toFixed(0)} Cr valuation.`, 'company', 'positive');
}

export function dailyStock(s: SimState): void {
  const st = s.stock;
  if (!st) return;
  const shares = totalShares(s);
  const fair = computeValuation(s, false).value * 1.15 / Math.max(1, shares);
  const pull = 0.01 * Math.log(Math.max(1e-6, fair) / Math.max(1e-6, st.price));
  const indexDrift = s.macro.phase === 'recession' ? -0.0008 : s.macro.phase === 'boom' ? 0.0006 : 0.0002;
  const shock = randNormal(s, 0, 0.018);
  st.sentiment = clamp(st.sentiment * 0.98, -1, 1);
  st.price = Math.max(0.01, st.price * Math.exp(pull + indexDrift + shock + st.sentiment * 0.002));
  st.sharesOutstanding = shares;
  if (s.day % 2 === 0) {
    st.history.push({ day: s.day, price: st.price });
    if (st.history.length > 1500) st.history.splice(0, st.history.length - 1500);
  }
}

/** Quarter-end earnings: EPS versus consensus moves the price. */
export function quarterlyEarnings(s: SimState): void {
  const st = s.stock;
  if (!st) return;
  const month = currentDate(s).month;
  if (month % 3 !== 0) return;
  // Called after the month's report is filed, so the last three reports are the quarter.
  const q = s.reports.slice(-3).reduce((a, r) => a + r.income.netIncome, 0);
  const shares = totalShares(s);
  const eps = shares > 0 ? q / shares : 0;
  const surprise = st.consensusEps !== 0 ? (eps - st.consensusEps) / Math.abs(st.consensusEps) : eps > 0 ? 0.1 : -0.1;
  const move = clamp(surprise * 0.15, -0.2, 0.2);
  st.price *= 1 + move;
  st.sentiment = clamp(st.sentiment + move * 3, -1, 1);
  st.analystRating = st.sentiment > 0.2 ? 'buy' : st.sentiment < -0.2 ? 'sell' : 'hold';
  st.lastEps = eps;
  st.consensusEps = eps * (1 + Math.max(0, computeValuation(s, false).growth) / 4);
  addNews(s, `${s.company.name} ${move >= 0 ? 'beats' : 'misses'} earnings expectations`, `Quarterly EPS ₹${eps.toFixed(2)}; shares ${move >= 0 ? 'rise' : 'fall'} ${(Math.abs(move) * 100).toFixed(1)}%.`, 'company', move >= 0 ? 'positive' : 'negative');
}

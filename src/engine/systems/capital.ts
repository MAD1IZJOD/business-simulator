// Equity: cap table, fundraising rounds, term sheets and negotiation.
import { INVESTORS, ROUND_BY_KIND, ROUNDS } from '../data/investors';
import type { InvestorDef } from '../data/investors';
import type { RoundKind, Shareholder, SimState, TermSheet } from '../types';
import { difficultyOf, founderOwnership, launchedProducts, totalShares } from '../context';
import { chance, randRange } from '../rng';
import { clamp, uid } from '../util';
import { moveCash, payExpense } from './ledger';
import { addNews } from './news';
import { fundingClimate } from './macro';
import { annualizedGrowth, computeValuation } from './valuation';

export const FOUNDER_SHARES = 10_000_000;

export function initialCapTable(s: SimState, founderName: string): Shareholder[] {
  return [{ id: uid(s, 'sh'), name: founderName, kind: 'founder', shares: FOUNDER_SHARES, invested: s.config.startingCapital, round: null }];
}

export function ownership(s: SimState): { holder: Shareholder; pct: number }[] {
  const t = totalShares(s);
  return s.capTable.map((h) => ({ holder: h, pct: t > 0 ? h.shares / t : 0 }));
}

export interface RoundEligibility {
  kind: RoundKind;
  name: string;
  eligible: boolean;
  reason: string;
  typicalSize: [number, number];
}

export function roundEligibility(s: SimState): RoundEligibility[] {
  const runRate = computeValuation(s).runRate;
  const launched = launchedProducts(s).length > 0;
  const raisedKinds = new Set(s.rounds.map((r) => r.kind));
  const order = ROUNDS.map((r) => r.kind);
  const lastIdx = Math.max(-1, ...s.rounds.map((r) => order.indexOf(r.kind)));
  return ROUNDS.map((r) => {
    const idx = order.indexOf(r.kind);
    let eligible = true;
    let reason = `Needs ~₹${(r.minRunRate / 1e7).toFixed(1)} Cr annual revenue run-rate.`;
    if (s.company.isPublic) { eligible = false; reason = 'Public companies raise through the stock market.'; }
    else if (s.raise) { eligible = false; reason = 'A round is already in progress.'; }
    else if (r.requiresLaunch && !launched) { eligible = false; reason = 'Launch a product first.'; }
    else if (runRate < (r.minRunRate * 0.8) / difficultyOf(s).financingEase) { eligible = false; }
    else if (idx < lastIdx && r.kind !== 'friends_family') { eligible = false; reason = 'You have already raised a later round.'; }
    else if (r.kind === 'friends_family' && raisedKinds.has('friends_family')) { eligible = false; reason = 'Friends & family already invested.'; }
    else reason = 'Eligible.';
    return { kind: r.kind, name: r.name, eligible, reason, typicalSize: r.typicalSize };
  });
}

function investorFit(s: SimState, inv: InvestorDef): number {
  const growth = annualizedGrowth(s);
  const r = s.reports[s.reports.length - 1];
  const margin = r && r.income.netRevenue > 0 ? r.income.ebitda / r.income.netRevenue : -1;
  switch (inv.preference) {
    case 'growth': return clamp(0.6 + growth * 0.4, 0.3, 1.8);
    case 'profitability': return clamp(1 + margin * 1.5, 0.3, 1.6);
    case 'market_share': return clamp(0.6 + s.metrics.marketShare * 4, 0.4, 1.8);
    case 'technology': return clamp(0.5 + Math.max(0, ...s.products.map((p) => p.quality)) / 100 + s.research.unlocked.length * 0.08, 0.4, 1.8);
    case 'social_impact': return clamp(0.4 + s.esg.score / 70, 0.3, 1.7);
  }
}

export function startRaise(s: SimState, kind: RoundKind): { ok: boolean; message: string } {
  const el = roundEligibility(s).find((e) => e.kind === kind);
  if (!el?.eligible) return { ok: false, message: el?.reason ?? 'Not eligible.' };
  const def = ROUND_BY_KIND[kind];
  s.raise = { kind, target: (def.typicalSize[0] + def.typicalSize[1]) / 2, startedDay: s.day, closesDay: s.day + Math.round(def.months * 30), termSheets: [], pitched: 0 };
  payExpense(s, 'fees', kind === 'friends_family' ? 10000 : 150000, 'Fundraising legal & pitch costs');
  return { ok: true, message: `${def.name} process started. Investors will respond over the next ${Math.round(def.months * 30)} days.` };
}

/** Daily: interested investors issue term sheets while the raise is open. */
export function dailyFundraising(s: SimState): void {
  const r = s.raise;
  if (!r) return;
  for (const ts of r.termSheets) if (ts.status === 'open' && ts.expiresDay <= s.day) ts.status = 'expired';
  if (s.day >= r.closesDay) {
    const open = r.termSheets.filter((t) => t.status === 'open');
    if (!open.length) {
      addNews(s, `${s.company.name}'s ${ROUND_BY_KIND[r.kind].name} round fails to close`, 'Investors passed. The company will try again later.', 'company', 'negative');
      s.company.reputation.investor = clamp(s.company.reputation.investor - 5, 0, 100);
      s.raise = null;
    }
    return;
  }
  const def = ROUND_BY_KIND[r.kind];
  const val = computeValuation(s).value;
  const climate = fundingClimate(s) * difficultyOf(s).financingEase;
  const candidates = INVESTORS.filter((i) => i.stages.includes(r.kind) && !r.termSheets.some((t) => t.investorId === i.id));
  const window = r.closesDay - r.startedDay;
  for (const inv of candidates) {
    const fit = investorFit(s, inv);
    const repF = 0.6 + s.company.reputation.investor / 125;
    const brandF = 0.8 + s.company.brand / 250;
    const pDaily = clamp((0.9 * fit * climate * repF * brandF - 0.25) / window, 0, 0.2);
    if (!chance(s, pDaily)) continue;
    const pre = Math.max(val, def.typicalSize[0] * 3) * clamp(fit, 0.6, 1.4) * randRange(s, 0.85, 1.12) * clamp(climate, 0.5, 1.4);
    const amount = clamp(Math.min(pre * randRange(s, 0.15, 0.3), inv.checkMax), inv.checkMin, inv.checkMax);
    const poolPct = s.capTable.find((h) => h.kind === 'option_pool');
    const poolShare = poolPct ? poolPct.shares / totalShares(s) : 0;
    const ts: TermSheet = {
      id: uid(s, 'ts'),
      investorId: inv.id,
      investorName: inv.name,
      amount: Math.round(amount),
      preMoney: Math.round(pre),
      boardSeat: inv.boardSeat,
      optionPoolTopUp: ['seed', 'series_a', 'series_b'].includes(r.kind) && poolShare < 0.1 ? 0.1 : 0,
      liquidationPref: 1,
      expectation: inv.description,
      expectedGrowth: def.expectedGrowth,
      expiresDay: s.day + 21,
      negotiationRounds: 0,
      reservationPreMoney: Math.round(pre * randRange(s, 1.04, 1.3)),
      status: 'open',
    };
    r.termSheets.push(ts);
    addNews(s, `Term sheet from ${inv.name}`, `₹${(ts.amount / 1e7).toFixed(2)} Cr at ₹${(ts.preMoney / 1e7).toFixed(1)} Cr pre-money.`, 'company', 'positive');
  }
}

export function negotiateTermSheet(s: SimState, tsId: string, askPreMoney: number): { ok: boolean; message: string } {
  const ts = s.raise?.termSheets.find((t) => t.id === tsId);
  if (!ts || ts.status !== 'open') return { ok: false, message: 'Term sheet is no longer open.' };
  ts.negotiationRounds += 1;
  if (askPreMoney <= ts.reservationPreMoney) {
    ts.preMoney = Math.round(askPreMoney);
    return { ok: true, message: `${ts.investorName} agreed to ₹${(ts.preMoney / 1e7).toFixed(2)} Cr pre-money.` };
  }
  const overshoot = askPreMoney / ts.reservationPreMoney - 1;
  if (ts.negotiationRounds >= 3 || chance(s, clamp(overshoot * 2, 0.05, 0.9))) {
    ts.status = 'withdrawn';
    s.company.reputation.investor = clamp(s.company.reputation.investor - 2, 0, 100);
    return { ok: false, message: `${ts.investorName} walked away from the deal.` };
  }
  const counter = Math.round((ts.preMoney + ts.reservationPreMoney) / 2);
  ts.preMoney = Math.max(ts.preMoney, counter);
  return { ok: false, message: `${ts.investorName} countered at ₹${(ts.preMoney / 1e7).toFixed(2)} Cr pre-money.` };
}

/** Issue shares for a primary investment. Returns price per share. */
export function issueEquity(s: SimState, name: string, amount: number, preMoney: number, round: string, poolTopUp = 0, investorId?: string): { price: number; newShares: number } {
  const before = totalShares(s);
  let poolNew = 0;
  let price = preMoney / before;
  let newShares = Math.round(amount / price);
  if (poolTopUp > 0) {
    // The pool is created pre-money: after the round it must equal `poolTopUp` of
    // all shares while the investor still owns amount / post-money. Existing
    // holders absorb the pool dilution, not the new investor.
    const investorPct = amount / (preMoney + amount);
    const existingPool = s.capTable.find((h) => h.kind === 'option_pool')?.shares ?? 0;
    const nonPool = before - existingPool;
    const postTotal = nonPool / (1 - poolTopUp - investorPct);
    poolNew = Math.max(0, Math.round(postTotal * poolTopUp - existingPool));
    newShares = Math.round(postTotal * investorPct);
    price = amount / newShares;
  }
  if (poolNew > 0) {
    let pool = s.capTable.find((h) => h.kind === 'option_pool');
    if (!pool) { pool = { id: uid(s, 'sh'), name: 'Employee option pool', kind: 'option_pool', shares: 0, invested: 0, round: null }; s.capTable.push(pool); }
    pool.shares += poolNew;
  }
  s.capTable.push({ id: uid(s, 'sh'), name, kind: 'investor', shares: newShares, invested: amount, round, investorId });
  s.finance.paidInCapital += amount;
  moveCash(s, amount, 'financing', 'Equity raised');
  return { price, newShares };
}

export function acceptTermSheet(s: SimState, tsId: string): { ok: boolean; message: string } {
  const r = s.raise;
  const ts = r?.termSheets.find((t) => t.id === tsId);
  if (!r || !ts || ts.status !== 'open') return { ok: false, message: 'Term sheet is no longer open.' };
  if (s.board.approvalsRequired && s.board.members.length > 1 && s.board.confidence < 25) return { ok: false, message: 'The board refuses to approve new financing right now (confidence too low).' };
  const founderBefore = founderOwnership(s);
  const { price, newShares } = issueEquity(s, ts.investorName, ts.amount, ts.preMoney, ROUND_BY_KIND[r.kind].name, ts.optionPoolTopUp, ts.investorId);
  payExpense(s, 'fees', ts.amount * 0.015, 'Deal legal fees');
  const post = ts.preMoney + ts.amount;
  s.rounds.push({ kind: r.kind, day: s.day, amount: ts.amount, preMoney: ts.preMoney, postMoney: post, pricePerShare: price, newShares, investors: [ts.investorName] });
  ts.status = 'accepted';
  for (const o of r.termSheets) if (o.status === 'open' && o.id !== ts.id) o.status = 'withdrawn';
  s.raise = null;
  if (ts.boardSeat) {
    s.board.members.push({ id: uid(s, 'b'), name: ts.investorName, kind: 'investor', priority: ts.investorId === 'meridian_growth' ? 'profitability' : ts.investorId === 'banyan' || ts.investorId === 'strategic_corp' ? 'market_share' : 'growth', satisfaction: 65 });
  }
  s.board.expectations = { growth: ts.expectedGrowth, minRunwayMonths: 9 };
  if (s.config.difficulty === 'hard' || s.config.difficulty === 'brutal' || s.board.members.filter((m) => m.kind === 'investor').length >= 2) s.board.approvalsRequired = true;
  s.company.reputation.investor = clamp(s.company.reputation.investor + 4, 0, 100);
  s.metrics.valuation = post;
  const founderAfter = founderOwnership(s);
  addNews(s, `${s.company.name} raises ₹${(ts.amount / 1e7).toFixed(2)} crore ${ROUND_BY_KIND[r.kind].name}`, `Led by ${ts.investorName} at a ₹${(post / 1e7).toFixed(1)} Cr post-money valuation.`, 'company', 'positive');
  return { ok: true, message: `Closed ₹${ts.amount.toLocaleString('en-IN')} at ₹${price.toFixed(2)}/share. Founder ownership ${(founderBefore * 100).toFixed(1)}% → ${(founderAfter * 100).toFixed(1)}%.` };
}

export function declineTermSheet(s: SimState, tsId: string): void {
  const ts = s.raise?.termSheets.find((t) => t.id === tsId);
  if (ts && ts.status === 'open') ts.status = 'rejected';
}

export function cancelRaise(s: SimState): void {
  s.raise = null;
}

/** Create or top up the option pool (pre-money style dilution of all holders). */
export function createOptionPool(s: SimState, pct: number): string {
  const t = totalShares(s);
  let pool = s.capTable.find((h) => h.kind === 'option_pool');
  const current = pool ? pool.shares / t : 0;
  if (pct <= current) return 'Pool is already at least that size.';
  const add = Math.round((pct * t - (pool?.shares ?? 0)) / (1 - pct));
  if (!pool) { pool = { id: uid(s, 'sh'), name: 'Employee option pool', kind: 'option_pool', shares: 0, invested: 0, round: null }; s.capTable.push(pool); }
  pool.shares += add;
  for (const e of s.employees) e.loyalty = clamp(e.loyalty + 3, 0, 100);
  return `Option pool now ${(pct * 100).toFixed(0)}% of the company.`;
}

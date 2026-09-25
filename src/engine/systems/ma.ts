// Mergers, acquisitions and exits.
import { ACQUIRER_NAMES } from '../data/names';
import { MARKET_BY_ID } from '../data/markets';
import type { Competitor, RoleId, SegmentId, SimState } from '../types';
import { founderOwnership, industryOf, totalShares } from '../context';
import { chance, pick, randRange } from '../rng';
import { clamp, uid } from '../util';
import { moveCash, payExpense } from './ledger';
import { addNews } from './news';
import { getCell } from './customers';
import { competitorRevenue, competitorCustomers } from './competitors';
import { createEmployee } from './employees';
import { newProduct } from './products';
import { computeValuation } from './valuation';
import { boardApproves } from './board';
import { issueEquity } from './capital';
import { emptyInventory } from './inventory';

export interface AcquisitionQuote {
  competitorId: string;
  name: string;
  valuation: number;
  askingPrice: number;
  revenue: number;
  customers: number;
  headcount: number;
  integrationCost: number;
  synergies: number;
  distressed: boolean;
}

export function acquisitionQuote(s: SimState, c: Competitor): AcquisitionQuote {
  const rev = competitorRevenue(s, c);
  const distressed = c.cash < 0 || c.negativeCashMonths > 0;
  const base = Math.max(c.valuation, rev * 12 * 0.5, 10000000);
  const premium = distressed ? 0.8 : 1.3;
  return {
    competitorId: c.id,
    name: c.name,
    valuation: base,
    askingPrice: Math.round(base * premium),
    revenue: rev,
    customers: competitorCustomers(c),
    headcount: c.headcount,
    integrationCost: Math.round(base * 0.08 + c.headcount * 150000),
    synergies: Math.round(rev * 0.12),
    distressed,
  };
}

/** Try to buy a competitor. Offers below their hidden reservation price are refused. */
export function acquireCompetitor(s: SimState, competitorId: string, offer: number, payment: 'cash' | 'stock'): { ok: boolean; message: string } {
  const c = s.competitors.find((x) => x.id === competitorId && x.status === 'active');
  if (!c) return { ok: false, message: 'Target not available.' };
  const q = acquisitionQuote(s, c);
  const key = `acqRes|${c.id}`;
  if (s.flags[key] === undefined) s.flags[key] = q.askingPrice * randRange(s, 0.85, 1.1);
  const reservation = Number(s.flags[key]);
  if (payment === 'cash' && s.finance.cash < offer + q.integrationCost * 0.25) return { ok: false, message: 'Not enough cash for the offer plus initial integration costs.' };
  const [ok, reason] = boardApproves(s, 'acquisition');
  if (!ok) return { ok: false, message: reason };
  if (offer < reservation) {
    s.flags[key] = reservation * 1.02;
    return { ok: false, message: `${c.name}'s board rejected ₹${(offer / 1e7).toFixed(2)} Cr. They hint that something near ₹${(reservation * 1.05 / 1e7).toFixed(2)} Cr could work.` };
  }
  if (payment === 'cash') moveCash(s, -offer, 'investing', 'Acquisitions');
  else {
    const ourVal = computeValuation(s).value;
    issueEquity(s, `${c.name} shareholders`, offer, ourVal, 'Acquisition');
    // issueEquity booked cash; for a share-swap no cash moves, so reverse the cash leg.
    moveCash(s, -offer, 'financing', 'Equity raised');
  }
  s.finance.goodwill += offer;
  absorbCompetitor(s, c, 0.85);
  // Integration: costs over 4 months and a temporary productivity dip.
  s.flags.integrationRemaining = Number(s.flags.integrationRemaining ?? 0) + q.integrationCost;
  s.modifiers.push({ id: uid(s, 'm'), target: 'productivity', value: 0.93, scope: null, startDay: s.day, endDay: s.day + 120, source: `Integrating ${c.name}` });
  addNews(s, `${s.company.name} acquires ${c.name}`, `Deal worth ₹${(offer / 1e7).toFixed(2)} Cr paid in ${payment}. ${Math.round(q.customers).toLocaleString('en-IN')} customers and a team of about ${Math.min(150, Math.round(c.headcount * 0.3))} join.`, 'company', 'positive');
  s.flags.acquisitions = Number(s.flags.acquisitions ?? 0) + 1;
  return { ok: true, message: `Acquired ${c.name} for ₹${offer.toLocaleString('en-IN')}.` };
}

const ROLE_MIX: RoleId[] = ['engineer', 'engineer', 'engineer', 'sdr', 'account_executive', 'marketer', 'support_agent', 'support_agent', 'ops_associate', 'product_manager', 'finance_analyst', 'cs_manager'];

function absorbCompetitor(s: SimState, c: Competitor, retention: number): void {
  const ind = industryOf(s);
  const p = newProduct(s, { name: `${c.name}`, category: `${ind.categories[0]} (acquired)`, positioning: c.priceIndex > 1.15 ? 'premium' : c.priceIndex < 0.85 ? 'budget' : 'mainstream', monetization: ind.defaultMonetization, qualityTarget: c.quality, featureScope: 55, monthlyBudget: 0, speed: 'normal' });
  p.stage = 'launched';
  p.phase = 'maturity';
  p.quality = c.quality;
  p.features = 55;
  p.dev.progress = 1;
  p.readyNotified = true;
  p.launchDay = s.day;
  p.acquired = true;
  p.price = Math.round(p.price * c.priceIndex * 100) / 100;
  p.lastPrice = p.price;
  p.satisfaction = 55;
  s.products.push(p);
  s.inventory[p.id] = emptyInventory(p.id);
  for (const key in c.customers) {
    const [mid, seg] = key.split('|');
    const n = c.customers[key] * retention;
    if (n <= 0 || !MARKET_BY_ID[mid]) continue;
    const ms = s.markets.find((m) => m.id === mid);
    if (ms && !ms.entered) { ms.entered = true; ms.enteredDay = s.day; ms.entering = false; }
    const cell = getCell(s, p.id, mid, seg as SegmentId);
    cell.customers += n;
    s.company.awareness[key] = Math.max(s.company.awareness[key] ?? 0, (c.awareness[mid] ?? 0) * 0.8);
  }
  const joiners = Math.min(150, Math.round(c.headcount * 0.3));
  for (let i = 0; i < joiners; i++) {
    const role = ROLE_MIX[i % ROLE_MIX.length];
    s.employees.push(createEmployee(s, role, 2 + (i % 3 === 0 ? 1 : 0), s.config.hqMarket, { startProductive: true }));
  }
  s.company.brand = clamp(s.company.brand + (c.brand - s.company.brand) * 0.15, 0, 100);
  c.status = 'acquired';
  c.customers = {};
}

/** Merger of equals: all-stock combination. `governance` decides who leads. */
export function mergeWith(s: SimState, competitorId: string, governance: 'our_ceo' | 'co_ceo' | 'their_ceo'): { ok: boolean; message: string } {
  const c = s.competitors.find((x) => x.id === competitorId && x.status === 'active');
  if (!c) return { ok: false, message: 'Partner not available.' };
  const ours = computeValuation(s).value;
  const theirs = acquisitionQuote(s, c).valuation;
  if (theirs < ours * 0.4 || theirs > ours * 2.5) return { ok: false, message: 'A merger of equals needs comparable valuations (0.4×–2.5× yours).' };
  const willing = governance === 'their_ceo' ? 0.9 : governance === 'co_ceo' ? 0.65 : 0.35;
  if (!chance(s, willing)) return { ok: false, message: `${c.name} rejected the proposed governance structure.` };
  const [ok, reason] = boardApproves(s, 'merger');
  if (!ok) return { ok: false, message: reason };
  const before = totalShares(s);
  const newShares = Math.round(before * (theirs / ours));
  s.capTable.push({ id: uid(s, 'sh'), name: `${c.name} shareholders`, kind: 'investor', shares: newShares, invested: theirs, round: 'Merger' });
  s.finance.paidInCapital += theirs;
  s.finance.goodwill += theirs;
  absorbCompetitor(s, c, 0.95);
  s.board.members.push({ id: uid(s, 'b'), name: `${c.name} founder`, kind: 'investor', priority: 'market_share', satisfaction: governance === 'our_ceo' ? 45 : 65 });
  s.board.approvalsRequired = true;
  const integration = governance === 'co_ceo' ? 1.3 : governance === 'our_ceo' ? 1.15 : 1;
  s.flags.integrationRemaining = Number(s.flags.integrationRemaining ?? 0) + theirs * 0.05 * integration;
  s.modifiers.push({ id: uid(s, 'm'), target: 'productivity', value: governance === 'co_ceo' ? 0.88 : 0.92, scope: null, startDay: s.day, endDay: s.day + 180, source: `Merger with ${c.name}` });
  if (governance === 'their_ceo') s.flags.founderDemoted = true;
  addNews(s, `${s.company.name} and ${c.name} merge`, `All-stock merger. ${c.name} holders own ${(newShares / (before + newShares) * 100).toFixed(0)}% of the combined company. Leadership: ${governance.replace('_', ' ')}.`, 'company', 'positive');
  return { ok: true, message: `Merged. Your founder ownership is now ${(founderOwnership(s) * 100).toFixed(1)}%.` };
}

export function monthlyIntegration(s: SimState): void {
  const rem = Number(s.flags.integrationRemaining ?? 0);
  if (rem <= 0) return;
  const pay = Math.min(rem, Math.max(rem / 4, 100000));
  payExpense(s, 'integration', pay, 'Integration costs');
  s.flags.integrationRemaining = rem - pay;
}

/**
 * Proceeds of a sale by holder class. Debt is repaid first. Investors hold a 1×
 * non-participating preference: each takes the larger of its money back or its
 * pro-rata share; everyone else splits the remainder by shares.
 */
export function exitWaterfall(s: SimState, price: number): { founder: number; investors: number; employees: number; debtRepaid: number } {
  const debt = s.loans.reduce((a, l) => a + (l.status === 'active' || l.status === 'defaulted' ? l.balance : 0), 0);
  const equity = Math.max(0, price + Math.max(0, s.finance.cash) - debt);
  const total = totalShares(s);
  if (total <= 0) return { founder: 0, investors: 0, employees: 0, debtRepaid: Math.min(debt, price) };
  // Investors whose preference beats their pro-rata share take the preference.
  const prefHolders = s.capTable.filter((h) => h.kind === 'investor' && h.invested > (h.shares / total) * equity);
  const prefPaid = Math.min(equity, prefHolders.reduce((a, h) => a + h.invested, 0));
  const remaining = equity - prefPaid;
  const commonShares = total - prefHolders.reduce((a, h) => a + h.shares, 0);
  let founder = 0;
  let employees = 0;
  let investors = prefPaid;
  for (const h of s.capTable) {
    if (prefHolders.includes(h)) continue;
    const share = commonShares > 0 ? (h.shares / commonShares) * remaining : 0;
    if (h.kind === 'founder') founder += share;
    else if (h.kind === 'employee' || h.kind === 'option_pool') employees += share;
    else investors += share;
  }
  return { founder, investors, employees, debtRepaid: Math.min(debt, price) };
}

export function maybeAcquisitionOffer(s: SimState): { acquirer: string; price: number } | null {
  const val = computeValuation(s);
  const v = val.value;
  if (v < 500000000 || val.runRate < 100000000 || s.status !== 'running') return null;
  if (!chance(s, 0.025 * (0.5 + s.company.brand / 100))) return null;
  return { acquirer: pick(s, ACQUIRER_NAMES), price: Math.round(v * randRange(s, 1.15, 1.6)) };
}

export function sellCompany(s: SimState, buyer: string, price: number, kind: 'acquired' | 'private_sale'): void {
  const w = exitWaterfall(s, price);
  s.status = 'ended';
  s.outcome = {
    kind,
    day: s.day,
    title: kind === 'acquired' ? `${s.company.name} acquired by ${buyer}` : `${s.company.name} sold in a private sale`,
    reason: `Sold for ₹${(price / 1e7).toFixed(1)} Cr.`,
    factors: [
      `Founder proceeds: ₹${(w.founder / 1e7).toFixed(2)} Cr (${(founderOwnership(s) * 100).toFixed(1)}% ownership after preferences)`,
      `Investors: ₹${(w.investors / 1e7).toFixed(2)} Cr`,
      `Employees (options): ₹${(w.employees / 1e7).toFixed(2)} Cr`,
      `Debt repaid: ₹${(w.debtRepaid / 1e7).toFixed(2)} Cr`,
    ],
    founderProceeds: w.founder,
  };
  addNews(s, s.outcome.title, s.outcome.reason, 'company', 'positive');
}

/** Founder buyout: the company repurchases outside investors' shares at the current price. */
export function founderBuyout(s: SimState, pct: number): { ok: boolean; message: string } {
  const investors = s.capTable.filter((h) => h.kind === 'investor');
  if (!investors.length) return { ok: false, message: 'There are no outside investors to buy out.' };
  const pps = computeValuation(s).value / totalShares(s);
  const shares = investors.reduce((a, h) => a + h.shares, 0) * clamp(pct, 0, 1);
  const cost = shares * pps;
  if (s.finance.cash < cost) return { ok: false, message: `Need ₹${(cost / 1e7).toFixed(2)} Cr in cash (consider a loan).` };
  const [ok, reason] = boardApproves(s, 'founder buyout');
  if (!ok) return { ok: false, message: reason };
  const before = founderOwnership(s);
  for (const h of investors) h.shares -= h.shares * clamp(pct, 0, 1);
  s.capTable = s.capTable.filter((h) => h.shares > 0.5 || h.kind === 'founder');
  s.finance.treasuryStock += cost;
  moveCash(s, -cost, 'financing', 'Share repurchases');
  if (pct >= 0.999) {
    s.board.members = s.board.members.filter((m) => m.kind !== 'investor');
    s.board.approvalsRequired = false;
  }
  return { ok: true, message: `Bought back ${(pct * 100).toFixed(0)}% of investor shares for ₹${(cost / 1e7).toFixed(2)} Cr. Founder ownership ${(before * 100).toFixed(1)}% → ${(founderOwnership(s) * 100).toFixed(1)}%.` };
}

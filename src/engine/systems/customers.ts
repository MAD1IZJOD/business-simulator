// Aggregated customer populations: one cell per (product, market, segment).
// Individual customers are not simulated — cells hold counts and ARPU expansion.
import { CHANNELS } from '../data/channels';
import type { AttributionSource, CustomerCell, SegmentId, SimState } from '../types';
import { addTo, cellKey, msKey } from '../util';
import { payExpense } from './ledger';

export function getCell(s: SimState, productId: string, marketId: string, segmentId: SegmentId): CustomerCell {
  const k = cellKey(productId, marketId, segmentId);
  let c = s.cells[k];
  if (!c) {
    c = { productId, marketId, segmentId, customers: 0, freeUsers: 0, arpuMult: 1 };
    s.cells[k] = c;
  }
  return c;
}

/** Customers in a market/segment across all our products. */
export function ourCustomersIn(s: SimState, marketId: string, segmentId: string): number {
  let t = 0;
  for (const k in s.cells) {
    const c = s.cells[k];
    if (c.marketId === marketId && c.segmentId === segmentId) t += c.customers + c.freeUsers * 0.5;
  }
  return t;
}

/**
 * Split new customers across acquisition sources in proportion to recent
 * awareness gains in that market/segment. `wom` is the share known to come
 * from referrals.
 */
export function attribute(s: SimState, marketId: string, segmentId: string, n: number, womShare: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (n <= 0) return out;
  const wom = n * Math.max(0, Math.min(1, womShare));
  if (wom > 0) out.word_of_mouth = wom;
  const rest = n - wom;
  const mix = s.marketing.sourceMix[msKey(marketId, segmentId)];
  let total = 0;
  if (mix) for (const src in mix) total += mix[src];
  if (!mix || total <= 1e-12) {
    out.organic = (out.organic ?? 0) + rest;
    return out;
  }
  for (const src in mix) out[src] = (out[src] ?? 0) + (rest * mix[src]) / total;
  return out;
}

export function recordAcquisition(s: SimState, segmentId: string, bySource: Record<string, number>, affiliateValue: number): void {
  let n = 0;
  for (const src in bySource) {
    const v = bySource[src];
    n += v;
    addTo(s.month.newByChannel, src, v);
  }
  s.month.newCustomers += n;
  addTo(s.month.newBySegment, segmentId, n);
  // Referral rewards and affiliate commissions are paid per acquired customer.
  const refs = bySource.word_of_mouth ?? 0;
  if (refs > 0 && s.marketing.referralReward > 0) {
    const cost = refs * s.marketing.referralReward;
    payAcquisitionCost(s, 'referral', cost);
  }
  const aff = bySource.affiliate ?? 0;
  if (aff > 0 && s.marketing.affiliateRate > 0) payAcquisitionCost(s, 'affiliate', aff * affiliateValue * (s.marketing.affiliateRate / 100));
}

function payAcquisitionCost(s: SimState, channel: AttributionSource, cost: number): void {
  if (cost <= 0) return;
  payExpense(s, 'marketing', cost, `${CHANNELS[channel as keyof typeof CHANNELS]?.name ?? channel} payouts`);
  addTo(s.month.marketingSpend, channel, cost);
}

export function addCustomers(s: SimState, productId: string, marketId: string, segmentId: SegmentId, n: number, bySource: Record<string, number>, affiliateValue = 0): void {
  if (n <= 0) return;
  const cell = getCell(s, productId, marketId, segmentId);
  // New customers start at base ARPU; blend the expansion multiplier.
  const total = cell.customers + n;
  cell.arpuMult = total > 0 ? (cell.arpuMult * cell.customers + n) / total : 1;
  cell.customers = total;
  recordAcquisition(s, segmentId, bySource, affiliateValue);
}

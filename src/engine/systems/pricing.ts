// Pricing & customer choice. Customers in a segment choose between our products,
// competitors and "not buying" with a multinomial logit over utilities. Price enters
// as -β·ln(price/reference), so elasticity differs by segment and by market share.
import { MONETIZATIONS } from '../data/businessModels';
import { INDUSTRIES } from '../data/industries';
import { MARKET_BY_ID } from '../data/markets';
import { SEGMENTS } from '../data/segments';
import type { Competitor, Product, SegmentId, SimState } from '../types';
import { fxRatio, industryOf, modifier } from '../context';
import { clamp } from '../util';

/** Reference (fair market) price a segment expects, in INR, for a market. */
export function referencePrice(s: SimState, marketId: string, seg: SegmentId, product?: Product): number {
  const ind = industryOf(s);
  const rt = product ? MONETIZATIONS[product.monetization].revenueType : 'recurring';
  if (rt === 'take_rate') return ind.takeRate > 0 ? ind.takeRate : 10;
  if (rt === 'advertising') return 5;
  const m = MARKET_BY_ID[marketId];
  const segDef = SEGMENTS[seg];
  return ind.basePrice * Math.pow(segDef.incomeMult, 0.7) * Math.pow(m.income, ind.priceIncomeExp) * s.macro.priceLevel * fxRatio(s, marketId);
}

/** The price a customer sees for our product in a market (INR, or % for take-rate, or ad load). */
export function customerPrice(s: SimState, p: Product, marketId: string): number {
  const rt = MONETIZATIONS[p.monetization].revenueType;
  if (rt === 'take_rate') return p.price;
  if (rt === 'advertising') return p.adLoad;
  const mkt = s.markets.find((m) => m.id === marketId);
  return p.price * (mkt?.priceMult ?? 1) * fxRatio(s, marketId);
}

/** Suggested purchasing-power-parity price multiplier for a market vs HQ. */
export function suggestedPriceMult(s: SimState, marketId: string): number {
  const ind = industryOf(s);
  const hq = MARKET_BY_ID[s.config.hqMarket];
  const m = MARKET_BY_ID[marketId];
  return Math.pow(m.income / hq.income, ind.priceIncomeExp);
}

export interface UtilityParts {
  price: number;
  quality: number;
  brand: number;
  reliability: number;
  reviews: number;
  novelty: number;
  network: number;
  patent: number;
  esg: number;
  fit: number;
  warranty: number;
}

export function sumUtility(u: UtilityParts): number {
  return u.price + u.quality + u.brand + u.reliability + u.reviews + u.novelty + u.network + u.patent + u.esg + u.fit + u.warranty;
}

export function priceTerm(seg: SegmentId, price: number, ref: number, brand: number, revenueType: string, sensMod = 1): number {
  const d = SEGMENTS[seg];
  if (revenueType === 'advertising') return -0.25 * (price - 5);
  const x = Math.log(Math.max(price, 1e-6) / Math.max(ref, 1e-6));
  const beta = d.priceSensitivity * (revenueType === 'take_rate' ? 0.6 : 1) * (1 - 0.35 * clamp(brand, 0, 100) / 100) * sensMod;
  return -beta * x + d.prestige * clamp(x, -1, 1);
}

/** Price elasticity of our demand in a segment given our current choice share (logit: -β(1-s)). */
export function priceElasticity(seg: SegmentId, brand: number, share: number, revenueType = 'recurring'): number {
  const d = SEGMENTS[seg];
  const beta = d.priceSensitivity * (revenueType === 'take_rate' ? 0.6 : 1) * (1 - 0.35 * brand / 100);
  return -(beta - d.prestige) * (1 - share);
}

export function effectiveQuality(s: SimState, p: Product): number {
  const ai = industryOf(s).id === 'ai' || industryOf(s).id === 'saas' ? s.tech.levels.ai * 1.5 : s.tech.levels.ai * 0.5;
  return clamp(p.quality + p.features * 0.12 - p.techDebt * 0.12 - p.defectRate * 60 + ai, 0, 110);
}

export function ratingFromSatisfaction(sat: number): number {
  return clamp(1 + (sat / 100) * 4, 1, 5);
}

export function networkUsers(s: SimState, productId: string): number {
  let t = 0;
  for (const k in s.cells) {
    const c = s.cells[k];
    if (c.productId === productId) t += c.customers + c.freeUsers;
  }
  return t;
}

export function networkStrength(s: SimState, p: Product): number {
  return industryOf(s).networkEffect + MONETIZATIONS[p.monetization].networkBoost;
}

function positioningFit(p: Product, seg: SegmentId): number {
  const table: Record<string, Partial<Record<SegmentId, number>>> = {
    budget: { budget: 0.35, students: 0.25, luxury: -0.5, enterprise: -0.3 },
    mainstream: { consumers: 0.15, smb: 0.1 },
    premium: { luxury: 0.2, enterprise: 0.2, budget: -0.25, students: -0.1 },
    luxury: { luxury: 0.45, budget: -0.6, students: -0.4, consumers: -0.15 },
  };
  return table[p.positioning]?.[seg] ?? 0;
}

/** Utility of one of our products for a segment in a market, with its parts. */
export function ourUtility(s: SimState, p: Product, marketId: string, seg: SegmentId): UtilityParts {
  const d = SEGMENTS[seg];
  const rt = MONETIZATIONS[p.monetization].revenueType;
  const brand = s.company.brand;
  const ref = referencePrice(s, marketId, seg, p);
  const price = customerPrice(s, p, marketId);
  const q = effectiveQuality(s, p);
  const reliability = s.metrics.reliability;
  const supportScore = clamp(100 - (s.metrics.responseHours - 4) * 2, 0, 100);
  const security = s.metrics.securityScore;
  const bizReq = d.reliabilityWeight * (reliability - 60) / 30 + d.supportWeight * (supportScore - 60) / 40 + d.securityWeight * (security - 60) / 40;
  const strength = networkStrength(s, p);
  const users = networkUsers(s, p.id);
  let network = strength * Math.log1p(users / 2000) * 0.3;
  if (p.monetization === 'marketplace') {
    const liquidity = clamp(p.sellers * 15 / Math.max(1, users), 0.1, 1);
    network *= liquidity;
  }
  network += Math.min(0.4, p.ecosystem / 500) ;
  const patent = p.patent?.status === 'granted' ? 0.25 * p.patent.strength : 0;
  const warranty = s.company.warrantyPolicy === 'extended' ? 0.15 : s.company.warrantyPolicy === 'none' ? -0.12 : 0;
  return {
    price: rt === 'recurring' && p.monetization === 'freemium' ? priceTerm(seg, price, ref, brand, rt, modifier(s, 'price_sensitivity')) * 0.6 : priceTerm(seg, price, ref, brand, rt, modifier(s, 'price_sensitivity')),
    quality: d.qualitySensitivity * (q - 50) / 22,
    brand: d.brandSensitivity * (brand - 50) / 40,
    reliability: bizReq,
    reviews: 0.35 * (s.company.reviewRating - 3.4),
    novelty: Math.log(clamp(p.novelty, 0.2, 1.5)),
    network: Math.min(1.2, network),
    patent,
    esg: d.esgWeight * (s.esg.score - 50) / 60,
    fit: positioningFit(p, seg),
    warranty: INDUSTRIES[s.config.industry].fulfillment === 'digital' ? 0 : warranty,
  };
}

export function competitorPrice(s: SimState, c: Competitor, marketId: string, seg: SegmentId): number {
  const ind = industryOf(s);
  if (ind.takeRate > 0 && (ind.defaultMonetization === 'transaction_fee' || ind.defaultMonetization === 'commission')) return ind.takeRate * c.priceIndex;
  return referencePrice(s, marketId, seg) * c.priceIndex;
}

export function competitorUtility(s: SimState, c: Competitor, _marketId: string, seg: SegmentId): number {
  const d = SEGMENTS[seg];
  const ind = industryOf(s);
  const takeRate = ind.takeRate > 0 && (ind.defaultMonetization === 'transaction_fee' || ind.defaultMonetization === 'commission');
  const x = Math.log(Math.max(0.05, c.priceIndex));
  const beta = d.priceSensitivity * (takeRate ? 0.6 : 1) * (1 - 0.35 * c.brand / 100);
  const price = -beta * x + d.prestige * clamp(x, -1, 1);
  let users = 0;
  for (const k in c.customers) users += c.customers[k];
  const network = Math.min(1.2, ind.networkEffect * Math.log1p(users / 2000) * 0.3);
  const rating = 3 + (c.quality - 50) / 30;
  const bizReq = (d.reliabilityWeight + d.supportWeight + d.securityWeight) * (c.quality - 55) / 60;
  return (
    price +
    d.qualitySensitivity * (c.quality - 50) / 22 +
    d.brandSensitivity * (c.brand - 50) / 40 +
    0.35 * (rating - 3.4) +
    Math.log(clamp(c.novelty, 0.2, 1.5)) +
    network +
    Math.min(0.3, c.patents * 0.08) +
    bizReq
  );
}

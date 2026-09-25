// Marketing: monthly budgets per channel are spent daily across entered markets.
// Spend buys reach with diminishing returns (saturation); reach × segment affinity
// raises awareness, which decays without reinforcement. Awareness gains by source
// feed attribution, so CAC by channel is computed from real flows.
import { CHANNELS, CHANNEL_IDS } from '../data/channels';
import { MARKET_BY_ID } from '../data/markets';
import { MANAGEMENT_STYLES } from '../data/roles';
import { SEGMENTS } from '../data/segments';
import type { MarketingChannelId, SimState } from '../types';
import { dim, fxRatio, gtmOf, modifier, roleCapacity, segmentsFor, audienceOf } from '../context';
import { addTo, clamp, msKey, saturate } from '../util';
import { payExpense } from './ledger';
import { ourCustomersIn } from './customers';

export function totalMarketingBudget(s: SimState): number {
  let t = 0;
  for (const c of CHANNEL_IDS) if (CHANNELS[c].costPerReach > 0 || CHANNELS[c].stock || CHANNELS[c].staffDriven) t += s.marketing.budgets[c];
  return t;
}

/** How spend is split between entered markets: bigger, richer markets get more. */
export function marketWeights(s: SimState): Map<string, number> {
  const out = new Map<string, number>();
  let total = 0;
  for (const m of s.markets) {
    if (!m.entered) continue;
    const d = MARKET_BY_ID[m.id];
    const w = Math.pow(d.population, 0.6) * Math.sqrt(d.income);
    out.set(m.id, w);
    total += w;
  }
  for (const [k, v] of out) out.set(k, total > 0 ? v / total : 0);
  return out;
}

export function marketingEfficiency(s: SimState): { value: number; factors: { label: string; value: number }[] } {
  const budget = totalMarketingBudget(s);
  const needed = budget / 600000;
  const cap = roleCapacity(s, 'marketer');
  const staffing = budget > 0 ? 0.55 + 0.45 * Math.min(1, needed > 0 ? cap / needed : 1) : 1;
  const style = MANAGEMENT_STYLES[s.company.managementStyle].marketingEff;
  const analytics = 1 + 0.04 * s.tech.levels.analytics;
  const events = modifier(s, 'awareness_gain');
  return {
    value: staffing * style * analytics * events,
    factors: [
      { label: 'Marketing team capacity', value: staffing },
      { label: 'Management style', value: style },
      { label: 'Analytics technology', value: analytics },
      { label: 'Events', value: events },
    ],
  };
}

/** Share of a market's population reached this month by a channel at a monthly spend. */
export function channelReach(s: SimState, ch: MarketingChannelId, monthlySpend: number, marketId: string): number {
  const def = CHANNELS[ch];
  const m = MARKET_BY_ID[marketId];
  const pop = m.population * 1e6;
  if (def.stock) {
    const stock = ch === 'seo' ? s.marketing.seoStock : s.marketing.contentStock;
    return def.maxReach * stock;
  }
  if (ch === 'affiliate') return s.marketing.affiliateRate > 0 ? def.maxReach * saturate(s.marketing.affiliateRate, 8) : 0;
  if (ch === 'referral') return 0;
  if (ch === 'outbound') {
    const smbOrgs = Math.max(500, pop * SEGMENTS.smb.density);
    const sdr = roleCapacity(s, 'sdr');
    return Math.min(def.maxReach, (sdr * 600 * (1 + saturate(monthlySpend, 100000))) / smbOrgs);
  }
  if (ch === 'direct_sales') {
    const orgs = Math.max(50, pop * (SEGMENTS.enterprise.density + SEGMENTS.government.density));
    const ae = roleCapacity(s, 'account_executive');
    return Math.min(def.maxReach, (ae * 40 * (1 + saturate(monthlySpend, 200000))) / orgs);
  }
  if (monthlySpend <= 0) return 0;
  const costIdx = Math.pow(m.income, 0.8) * fxRatio(s, marketId) * s.macro.priceLevel * modifier(s, 'cac');
  const minF = def.minEffective > 0 && monthlySpend < def.minEffective ? Math.pow(monthlySpend / def.minEffective, 1.5) : 1;
  const x = (monthlySpend * minF) / (def.costPerReach * costIdx * pop);
  return def.maxReach * (1 - Math.exp(-x / def.maxReach));
}

/** People reached per month (before saturation) by spend in a market. */
export function peopleReached(s: SimState, ch: MarketingChannelId, monthlySpend: number, marketId: string): number {
  const def = CHANNELS[ch];
  if (monthlySpend <= 0 || def.costPerReach <= 0 || def.staffDriven) return 0;
  const m = MARKET_BY_ID[marketId];
  const costIdx = Math.pow(m.income, 0.8) * fxRatio(s, marketId) * s.macro.priceLevel * modifier(s, 'cac');
  const minF = def.minEffective > 0 && monthlySpend < def.minEffective ? Math.pow(monthlySpend / def.minEffective, 1.5) : 1;
  return (monthlySpend * minF) / (def.costPerReach * costIdx);
}

/** How strongly campaigns are aimed at a segment: the chosen audience and the target segment get the budget. */
export function targetingWeight(s: SimState, seg: keyof typeof SEGMENTS): number {
  const aud = audienceOf(s);
  const base = SEGMENTS[seg].kind === 'business' ? aud.business : aud.consumer;
  return base * (s.config.targetSegment === seg ? 2 : 1);
}

/**
 * Share of each segment reached this month by a paid channel. Reach is allocated
 * across segments by audience size × channel affinity × targeting, and business
 * audiences cost more to reach (segment CAC multiplier). Saturates per segment.
 */
export function segmentReach(s: SimState, ch: MarketingChannelId, monthlySpend: number, marketId: string, segs: (keyof typeof SEGMENTS)[]): Record<string, number> {
  const out: Record<string, number> = {};
  const people = peopleReached(s, ch, monthlySpend, marketId);
  if (people <= 0) return out;
  const def = CHANNELS[ch];
  const pop = MARKET_BY_ID[marketId].population * 1e6;
  let total = 0;
  const w: Record<string, number> = {};
  for (const seg of segs) {
    const segPop = pop * SEGMENTS[seg].density;
    w[seg] = segPop * def.affinity[seg] * targetingWeight(s, seg);
    total += w[seg];
  }
  if (total <= 0) return out;
  for (const seg of segs) {
    const segPop = Math.max(1, pop * SEGMENTS[seg].density);
    const x = (people * (w[seg] / total)) / (segPop * SEGMENTS[seg].cacMult);
    out[seg] = def.maxReach * (1 - Math.exp(-x / def.maxReach));
  }
  return out;
}

export function dailyMarketing(s: SimState): void {
  const days = dim(s);
  const dt = 1 / days;
  const mk = s.marketing;
  // Spend (referral & affiliate are paid per result elsewhere).
  for (const c of CHANNEL_IDS) {
    const b = mk.budgets[c];
    if (b <= 0 || c === 'referral' || c === 'affiliate') continue;
    const spend = b * dt;
    payExpense(s, 'marketing', spend, 'Marketing campaigns');
    addTo(s.month.marketingSpend, c, spend);
  }
  // Organic assets accumulate slowly and decay slowly.
  const labor = 1;
  mk.seoStock = clamp(mk.seoStock + ((mk.budgets.seo / (400000 * labor)) * 0.25 * (1 - mk.seoStock) - 0.02 * mk.seoStock) * dt, 0, 1);
  mk.contentStock = clamp(mk.contentStock + ((mk.budgets.content / (400000 * labor)) * 0.25 * (1 - mk.contentStock) - 0.025 * mk.contentStock) * dt, 0, 1);

  const eff = marketingEfficiency(s).value;
  const weights = marketWeights(s);
  const segs = segmentsFor(s);
  const gtm = gtmOf(s);
  const aud = audienceOf(s);
  const brand = s.company.brand;
  const partnerReach = s.partnerships
    .filter((p) => p.status === 'active' && (p.kind === 'distribution' || p.kind === 'customers'))
    .reduce((a, p) => a + p.strength * 0.03, 0) * (1 + aud.partnerBoost);
  const decay = 0.05 * (1 - brand / 200);

  for (const [marketId, w] of weights) {
    // Untargeted reach (organic assets, staff-driven outreach, affiliates) × segment affinity.
    const untargeted: Partial<Record<MarketingChannelId, number>> = {};
    const targeted: Partial<Record<MarketingChannelId, Record<string, number>>> = {};
    for (const c of CHANNEL_IDS) {
      const def = CHANNELS[c];
      if (def.costPerReach > 0 && !def.staffDriven) {
        if (mk.budgets[c] > 0) targeted[c] = segmentReach(s, c, mk.budgets[c] * w, marketId, segs);
      } else {
        const r = channelReach(s, c, mk.budgets[c] * w, marketId);
        if (r > 0) untargeted[c] = r;
      }
    }
    const pop = MARKET_BY_ID[marketId].population * 1e6;
    for (const seg of segs) {
      const key = msKey(marketId, seg);
      const aw = s.company.awareness[key] ?? 0;
      const gains: Record<string, number> = {};
      let total = 0;
      for (const c in untargeted) {
        const g = (untargeted[c as MarketingChannelId] ?? 0) * CHANNELS[c as MarketingChannelId].affinity[seg] * eff;
        if (g > 0) { gains[c] = g; total += g; }
      }
      for (const c in targeted) {
        const g = (targeted[c as MarketingChannelId]?.[seg] ?? 0) * eff;
        if (g > 0) { gains[c] = (gains[c] ?? 0) + g; total += g; }
      }
      const segPop = Math.max(1, pop * SEGMENTS[seg].density);
      const wom = Math.min(0.2, (ourCustomersIn(s, marketId, seg) * 0.6) / segPop);
      if (wom > 0) { gains.word_of_mouth = wom; total += wom; }
      const organic = 0.001 + (brand / 100) * 0.003 + gtm.reachBoost * 0.03;
      gains.organic = organic;
      total += organic;
      if (partnerReach > 0) { gains.partner = partnerReach; total += partnerReach; }
      const next = aw + (total * (1 - aw) - decay * aw) * dt;
      s.company.awareness[key] = clamp(next, 0, 0.98);
      let mix = mk.sourceMix[key];
      if (!mix) { mix = {}; mk.sourceMix[key] = mix; }
      for (const src in mix) mix[src] *= 1 - 0.7 * dt;
      for (const src in gains) mix[src] = (mix[src] ?? 0) + gains[src] * dt;
    }
  }
  // Track average awareness for reports.
  let a = 0;
  let n = 0;
  for (const k in s.company.awareness) { a += s.company.awareness[k]; n++; }
  s.month.awarenessAvg = n ? a / n : 0;
}

/** Brand-building contribution this month from spend in brand-heavy channels (0..~25). */
export function brandInvestment(s: SimState): number {
  let v = 0;
  const weights = marketWeights(s);
  for (const [marketId, w] of weights) {
    for (const c of CHANNEL_IDS) {
      const r = channelReach(s, c, s.marketing.budgets[c] * w, marketId);
      v += r * CHANNELS[c].brandBuild * w;
    }
  }
  return Math.min(25, v * 120);
}

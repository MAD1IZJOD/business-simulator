// Sales pipeline for sales-led business segments.
// Lead → Qualified → Proposal → Negotiation → Won / Lost.
// Throughput is limited by SDR and account-executive capacity; win rate comes
// from the same customer-choice model as self-serve sales, adjusted by sales skill.
import { SEGMENTS } from '../data/segments';
import type { PipelineBucket, SegmentId, SimState } from '../types';
import { dim, roleCapacity } from '../context';
import { clamp } from '../util';
import { addCustomers, attribute } from './customers';

function bucketKey(productId: string, marketId: string, seg: string): string {
  return `${productId}|${marketId}|${seg}`;
}

export function addLeads(s: SimState, productId: string, marketId: string, seg: SegmentId, leads: number): void {
  if (leads <= 0) return;
  const k = bucketKey(productId, marketId, seg);
  let b = s.sales.pipeline[k];
  if (!b) {
    b = { productId, marketId, segmentId: seg, lead: 0, qualified: 0, proposal: 0, negotiation: 0 };
    s.sales.pipeline[k] = b;
  }
  b.lead += leads;
}

/** Deals per month an AE can actively work, by segment. */
const DEALS_PER_AE: Partial<Record<SegmentId, number>> = { smb: 30, enterprise: 6, government: 4 };
const QUALIFY_PER_SDR = 80;

function avgSkill(s: SimState, role: string): number {
  const es = s.employees.filter((e) => e.role === role);
  if (!es.length) return s.employees.find((e) => e.role === 'founder')?.skill ?? 50;
  return es.reduce((a, e) => a + e.skill, 0) / es.length;
}

/** Store the latest conditional choice share for win-rate calculation. */
export function setWinShare(s: SimState, productId: string, marketId: string, seg: string, share: number): void {
  s.flags[`ws|${bucketKey(productId, marketId, seg)}`] = share;
}

export function dailySales(s: SimState): void {
  const days = dim(s);
  const buckets = Object.values(s.sales.pipeline);
  if (!buckets.length) return;
  const aiBoost = 1 + 0.04 * s.tech.levels.ai;
  const sdrCap = (roleCapacity(s, 'sdr') * QUALIFY_PER_SDR * aiBoost) / days;
  const aeCapUnits = (roleCapacity(s, 'account_executive') * aiBoost) / days;
  const aeSkill = avgSkill(s, 'account_executive');
  const brandF = 0.8 + 0.4 * (s.company.brand / 100);

  // Distribute capacity proportionally to demand at each stage.
  const totalLeads = buckets.reduce((a, b) => a + b.lead, 0);
  const totalQualDemand = buckets.reduce((a, b) => a + b.qualified / Math.max(1, (DEALS_PER_AE[b.segmentId] ?? 20)), 0);
  // With no SDRs, AEs (or the founder) qualify their own leads at a third of the pace.
  const qualifyCap = sdrCap > 0 ? sdrCap : aeCapUnits * QUALIFY_PER_SDR * 0.33;

  for (const b of buckets) {
    const seg = SEGMENTS[b.segmentId];
    const stageDays = Math.max(2, seg.salesCycleDays / 4);
    // Leads go cold.
    b.lead *= 1 - 0.02;
    // Lead → qualified
    const wantQ = b.lead / stageDays;
    const capQ = totalLeads > 0 ? qualifyCap * (b.lead / totalLeads) : 0;
    const processedQ = Math.min(wantQ, capQ);
    b.lead -= processedQ;
    b.qualified += processedQ * 0.55;
    // Qualified → proposal (AE time)
    const dealsPerAe = DEALS_PER_AE[b.segmentId] ?? 20;
    const wantP = b.qualified / stageDays;
    const share = totalQualDemand > 0 ? (b.qualified / dealsPerAe) / totalQualDemand : 0;
    const capP = aeCapUnits * dealsPerAe * share;
    const processedP = Math.min(wantP, capP);
    b.qualified -= processedP;
    b.proposal += processedP * 0.8;
    // Proposal → negotiation
    const toNeg = b.proposal / stageDays;
    b.proposal -= toNeg;
    b.negotiation += toNeg * 0.75;
    // Negotiation → close
    const closing = b.negotiation / stageDays;
    b.negotiation -= closing;
    const base = Number(s.flags[`ws|${bucketKey(b.productId, b.marketId, b.segmentId)}`] ?? 0.3);
    const winRate = clamp(base * Math.sqrt(aeSkill / 60) * brandF * 1.6, 0.05, 0.85);
    const won = closing * winRate;
    s.sales.wonThisMonth += won;
    s.sales.lostThisMonth += closing - won;
    if (won > 0) {
      const src = attribute(s, b.marketId, b.segmentId, won, 0);
      // Deals closed by the sales team are credited to direct/outbound sales where those channels ran.
      const bySource: Record<string, number> = {};
      const salesSource = seg.salesLed ? 'direct_sales' : 'outbound';
      for (const k in src) {
        const key = k === 'organic' ? salesSource : k;
        bySource[key] = (bySource[key] ?? 0) + src[k];
      }
      addCustomers(s, b.productId, b.marketId, b.segmentId, won, bySource);
    }
  }
}

export function pipelineTotals(s: SimState): { lead: number; qualified: number; proposal: number; negotiation: number } {
  const t = { lead: 0, qualified: 0, proposal: 0, negotiation: 0 };
  for (const b of Object.values(s.sales.pipeline)) {
    t.lead += b.lead;
    t.qualified += b.qualified;
    t.proposal += b.proposal;
    t.negotiation += b.negotiation;
  }
  return t;
}

/** Expected value of the open pipeline: deals × annual contract value × stage probability. */
export function pipelineValue(s: SimState, acvOf: (b: PipelineBucket) => number): number {
  let v = 0;
  for (const b of Object.values(s.sales.pipeline)) {
    const acv = acvOf(b);
    v += acv * (b.lead * 0.05 + b.qualified * 0.15 + b.proposal * 0.3 + b.negotiation * 0.5);
  }
  return v;
}

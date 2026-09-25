// Large enterprise contracts: named customers with explicit value, billing
// schedule, SLAs, penalties and renewal risk. Billing in advance creates
// deferred revenue that is recognised month by month.
import { CLIENT_PREFIX, CLIENT_SUFFIX } from '../data/names';
import { SEGMENTS } from '../data/segments';
import type { Contract, SegmentId, SimState } from '../types';
import { industryOf, launchedProducts, roleCapacity } from '../context';
import { chance, pick, randRange } from '../rng';
import { clamp, uid } from '../util';
import { addReceivable, payExpense, recordRevenue } from './ledger';
import { addNews } from './news';
import { createDecision, hasOpenDecision } from './decisionCore';
import { revenuePerUnitOfActivity, unitsPerCustomer } from './market';

export function contractRevenueMonthly(c: Contract): number {
  return c.annualValue / 12;
}

export function activeContracts(s: SimState): Contract[] {
  return s.contracts.filter((c) => c.status === 'active' || c.status === 'renewed');
}

/** Generate a large-deal opportunity if we sell to businesses and have sales capacity. */
export function maybeOfferContract(s: SimState): void {
  const ind = industryOf(s);
  const products = launchedProducts(s);
  const bizSegs = (Object.keys(ind.adoption) as SegmentId[]).filter((k) => SEGMENTS[k].kind === 'business' && k !== 'smb');
  if (!products.length || !bizSegs.length) return;
  if (hasOpenDecision(s, 'enterprise_contract')) return;
  const ae = roleCapacity(s, 'account_executive');
  const p = 0.08 * (0.4 + s.company.brand / 80) * (ae > 0 ? 1 + Math.min(2, ae / 3) : 0.35) * (s.company.audience === 'b2c' ? 0.3 : 1);
  if (!chance(s, p)) return;
  const product = pick(s, products);
  const seg = pick(s, bizSegs);
  const market = pick(s, s.markets.filter((m) => m.entered));
  const monthlyBase = revenuePerUnitOfActivity(s, product, market.id, seg) * (product.monetization === 'one_time' ? ind.purchaseFreq : 1);
  const size = randRange(s, 2, 8);
  const annualValue = Math.round(Math.max(monthlyBase * size * 12, 600000));
  const duration = pick(s, [12, 24, 36]);
  const client = `${pick(s, CLIENT_PREFIX)} ${seg === 'government' ? pick(s, ['Ministry of Commerce', 'Municipal Corp.', 'State Transport']) : pick(s, CLIENT_SUFFIX)}`;
  const schedule = pick(s, ['monthly', 'quarterly', 'annual_upfront'] as const);
  const terms = SEGMENTS[seg].paymentTermsDays;
  const sla = pick(s, [99.0, 99.5, 99.9]);
  const impl = Math.round(annualValue * randRange(s, 0.08, 0.22));
  const data = { productId: product.id, segmentId: seg, marketId: market.id, client, annualValue, duration, schedule, terms, sla, impl, penalty: pick(s, [0.05, 0.1]), supportLoad: Math.round(unitsPerCustomer(s, seg) * 0.4 * size) };
  createDecision(s, {
    kind: 'enterprise_contract',
    category: 'opportunity',
    title: `${client} wants a ${duration}-month contract for ${product.name}`,
    description: `A large ${SEGMENTS[seg].name.toLowerCase()} buyer in ${market.id.toUpperCase()} is choosing a vendor. Worth ₹${(annualValue / 1e5).toFixed(1)} lakh a year, billed ${schedule.replace('_', ' ')} on ${terms}-day terms. SLA ${sla}% uptime with ${(data.penalty * 100).toFixed(0)}% monthly credits on breach. Implementation costs about ₹${(impl / 1e5).toFixed(1)} lakh upfront.`,
    days: 20,
    options: [
      { id: 'accept', label: 'Accept terms', description: 'Sign as offered.', consequences: [`+₹${(annualValue / 1e5).toFixed(1)}L annual revenue`, `−₹${(impl / 1e5).toFixed(1)}L implementation`, 'Adds support load and SLA exposure', 'Raises customer concentration'] },
      { id: 'negotiate', label: 'Negotiate +15% price', description: 'Push for a higher price. They might walk.', consequences: ['~55% chance they accept', 'Otherwise the deal is lost'] },
      { id: 'decline', label: 'Decline', description: 'Pass on this deal.', consequences: ['No revenue, no risk'] },
    ],
    defaultOption: 'decline',
    data,
  });
}

export function signContract(s: SimState, d: Record<string, unknown>, priceMult = 1): Contract {
  const c: Contract = {
    id: uid(s, 'ct'),
    client: String(d.client),
    segmentId: d.segmentId as SegmentId,
    marketId: String(d.marketId),
    productId: String(d.productId),
    annualValue: Math.round(Number(d.annualValue) * priceMult),
    durationMonths: Number(d.duration),
    startDay: s.day,
    endDay: s.day + Math.round(Number(d.duration) * 30.4),
    implementationCost: Number(d.impl),
    implementationMonths: 2,
    supportLoad: Number(d.supportLoad),
    paymentSchedule: d.schedule as Contract['paymentSchedule'],
    paymentTermsDays: Number(d.terms),
    slaUptime: Number(d.sla),
    penaltyRate: Number(d.penalty),
    renewalProbability: 0.7,
    status: 'active',
    satisfaction: 70,
    penaltiesPaid: 0,
    recognized: 0,
  };
  s.contracts.push(c);
  addNews(s, `${s.company.name} wins ${c.client}`, `A ₹${(c.annualValue / 1e5).toFixed(1)} lakh/year, ${c.durationMonths}-month contract.`, 'company', 'positive');
  return c;
}

function billingMonths(c: Contract): number {
  return c.paymentSchedule === 'monthly' ? 1 : c.paymentSchedule === 'quarterly' ? 3 : 12;
}

/** Uptime delivered this month, derived from reliability. */
export function deliveredUptime(s: SimState): number {
  return clamp(97 + (s.metrics.reliability / 100) * 3 - s.metrics.outageDays * 0.1, 90, 99.99);
}

export function monthlyContracts(s: SimState): void {
  const uptime = deliveredUptime(s);
  for (const c of s.contracts) {
    if (c.status !== 'active' && c.status !== 'renewed') continue;
    const monthIndex = Math.floor((s.day - c.startDay) / 30.4);
    const monthly = contractRevenueMonthly(c);
    // Implementation over the first months.
    if (monthIndex < c.implementationMonths) payExpense(s, 'implementation', c.implementationCost / c.implementationMonths, 'Contract implementation');
    // Bill in advance: receivable + deferred revenue.
    if (monthIndex % billingMonths(c) === 0) {
      const bill = monthly * billingMonths(c);
      addReceivable(s, bill, c.paymentTermsDays, 'Contract billing');
      s.finance.deferredRevenue += bill;
    }
    // Recognise one month.
    const rec = Math.min(monthly, s.finance.deferredRevenue);
    s.finance.deferredRevenue -= rec;
    recordRevenue(s, rec, { productId: c.productId, marketId: c.marketId, segmentId: c.segmentId, stream: 'Enterprise contracts' });
    c.recognized += rec;
    // SLA
    if (uptime < c.slaUptime) {
      const credit = monthly * c.penaltyRate;
      c.penaltiesPaid += credit;
      s.month.slaBreaches += 1;
      payExpense(s, 'other', credit, 'SLA credits');
      c.satisfaction = clamp(c.satisfaction - 8, 0, 100);
    }
    const product = s.products.find((p) => p.id === c.productId);
    const supportScore = clamp(100 - (s.metrics.responseHours - 4) * 2, 0, 100);
    const target = 40 + (product?.quality ?? 50) * 0.3 + supportScore * 0.2 + (uptime >= c.slaUptime ? 10 : -10);
    c.satisfaction = clamp(c.satisfaction * 0.8 + target * 0.2, 0, 100);
    c.renewalProbability = clamp(0.25 + c.satisfaction / 120, 0.05, 0.97);
    if (s.day >= c.endDay) {
      if (chance(s, c.renewalProbability)) {
        c.status = 'renewed';
        c.startDay = s.day;
        c.endDay = s.day + Math.round(c.durationMonths * 30.4);
        c.annualValue = Math.round(c.annualValue * randRange(s, 1.0, 1.12));
        addNews(s, `${c.client} renews with ${s.company.name}`, `Now worth ₹${(c.annualValue / 1e5).toFixed(1)} lakh a year.`, 'company', 'positive');
      } else {
        c.status = 'churned';
        addNews(s, `${c.client} does not renew`, `A ₹${(c.annualValue / 1e5).toFixed(1)} lakh/year account is lost (satisfaction ${c.satisfaction.toFixed(0)}).`, 'company', 'negative');
      }
    }
  }
}

/** Share of revenue from the single largest contract. */
export function customerConcentration(s: SimState, monthlyRevenue: number): { share: number; client: string | null } {
  const act = activeContracts(s);
  if (!act.length || monthlyRevenue <= 0) return { share: 0, client: null };
  const top = act.reduce((a, c) => (c.annualValue > a.annualValue ? c : a));
  return { share: clamp(contractRevenueMonthly(top) / monthlyRevenue, 0, 1), client: top.client };
}

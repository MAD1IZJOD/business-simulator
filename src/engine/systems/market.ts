// The market: every day, in every market and customer segment, buyers come into
// the market, move through the funnel, choose between us, competitors and not
// buying (logit), and existing customers churn. Physical and service businesses
// are limited by inventory and delivery capacity. Revenue and cost of sales are
// posted to the ledger from the resulting activity — never invented.
import { CHANNELS } from '../data/channels';
import { MONETIZATIONS } from '../data/businessModels';
import { MARKET_BY_ID } from '../data/markets';
import { SEGMENTS } from '../data/segments';
import type { Competitor, CustomerCell, Product, SegmentId, SimState } from '../types';
import {
  audienceOf, difficultyOf, dim, fxRatio, gtmOf, industryOf, isSalesLed, launchedProducts, modifier,
  physical, roleCapacity, segmentsFor,
} from '../context';
import { currentDate } from '../calendar';
import { addTo, clamp, msKey } from '../util';
import { addCustomers, attribute, getCell } from './customers';
import { moveCash, payCogs, payExpense, recordCogs, recordRefund, sell } from './ledger';
import { avgFinishedCost, consumeForSale } from './inventory';
import { competitorUtility, customerPrice, ourUtility, sumUtility } from './pricing';
import { hostingCost, unitCost } from './products';
import { addLeads, setWinShare } from './sales';

/** Baseline funnel pass-through rates (before our modifiers). */
export const FUNNEL_BASE = { interest: 0.45, visit: 0.6, consideration: 0.55, trial: 0.5, activation: 0.85 };
const PRE_CHOICE = FUNNEL_BASE.interest * FUNNEL_BASE.visit * FUNNEL_BASE.consideration * FUNNEL_BASE.trial;

export function unitsPerCustomer(s: SimState, seg: SegmentId): number {
  const d = SEGMENTS[seg];
  return d.kind === 'business' ? 1 + (d.units - 1) * industryOf(s).b2bScale : 1;
}

/** Demand multiplier from the economy: confidence × industry cyclicality. */
export function macroDemandFactor(s: SimState, seg: SegmentId, macroSensitivity = 1): number {
  const ind = industryOf(s);
  const conf = SEGMENTS[seg].kind === 'business' ? s.macro.businessConfidence : s.macro.consumerConfidence;
  return clamp(1 + ind.cyclicality * macroSensitivity * ((conf - 50) / 100) * 1.2, 0.3, 1.7);
}

export function seasonality(s: SimState): number {
  const ind = industryOf(s);
  const month = currentDate(s).month;
  return 1 + ind.seasonAmp * Math.cos((2 * Math.PI * (month - ind.peakMonth)) / 12);
}

/** Total potential customers (people or organisations) in a market segment. */
export function segmentPotential(s: SimState, marketId: string, seg: SegmentId): number {
  const def = MARKET_BY_ID[marketId];
  const ms = s.markets.find((m) => m.id === marketId);
  const adoption = industryOf(s).adoption[seg] ?? 0;
  const sandbox = s.config.difficulty === 'sandbox' ? s.config.sandbox.marketSizeMult : 1;
  return def.population * 1e6 * SEGMENTS[seg].density * adoption * (ms?.sizeMult ?? 1) * sandbox;
}

/** Service delivery capacity (units per day) from specialists; Infinity if not a service constraint. */
export function serviceCapacityPerDay(s: SimState): number {
  const ind = industryOf(s);
  if (ind.serviceCapacity <= 0) return Infinity;
  const automation = 1 + 0.06 * s.tech.levels.automation;
  return (roleCapacity(s, 'specialist') * ind.serviceCapacity * automation) / dim(s);
}

/** Store capacity (units/day) in a market; Infinity when stores are not required. */
export function storeCapacityPerDay(s: SimState, marketId: string): number {
  const ind = industryOf(s);
  if (!ind.requiresStores || s.company.gtm === 'franchise') return Infinity;
  let cap = 0;
  for (const f of s.facilities) if (f.kind === 'store' && f.marketId === marketId) cap += f.capacity;
  return cap / dim(s);
}

export function realization(s: SimState): number {
  return gtmOf(s).priceRealization;
}

/** Revenue we earn per customer-month (recurring/take-rate/ads) or per purchase (transactional), INR. */
export function revenuePerUnitOfActivity(s: SimState, p: Product, marketId: string, seg: SegmentId, arpuMult = 1): number {
  const ind = industryOf(s);
  const rt = MONETIZATIONS[p.monetization].revenueType;
  const upc = unitsPerCustomer(s, seg);
  const m = MARKET_BY_ID[marketId];
  const fx = fxRatio(s, marketId);
  switch (rt) {
    case 'take_rate': {
      const gmv = ind.gmvPerUnit * upc * Math.sqrt(m.income) * fx * s.macro.priceLevel * arpuMult * Math.max(0.2, ind.purchaseFreq);
      return gmv * (p.price / 100) * realization(s);
    }
    case 'advertising':
      return ind.adArpu * (p.adLoad / 5) * Math.pow(m.income, 0.8) * fx * s.macro.priceLevel;
    case 'transactional':
      return customerPrice(s, p, marketId) * upc * realization(s);
    default:
      return customerPrice(s, p, marketId) * upc * arpuMult * realization(s);
  }
}

interface ChurnResult {
  rate: number; // monthly
  factors: Record<string, number>; // ln multipliers
}

export function churnRate(s: SimState, p: Product, cell: CustomerCell, uGap: number): ChurnResult {
  const ind = industryOf(s);
  const seg = SEGMENTS[cell.segmentId];
  const mon = MONETIZATIONS[p.monetization];
  const diff = difficultyOf(s);
  const base = ind.baseChurn * seg.churnMult * mon.churnMult * diff.churnMult;
  const f: Record<string, number> = {};
  f.satisfaction = (60 - p.satisfaction) / 25;
  // Recent price increases shake loose existing customers.
  if (p.priceChangedDay !== null && s.day - p.priceChangedDay < 60 && p.price > p.lastPrice * 1.03 && mon.revenueType !== 'transactional') {
    f.price_increase = Math.log(1 + 2 * (p.price / p.lastPrice - 1));
  }
  f.competition = Math.log(1 + 0.18 * Math.max(0, uGap));
  const conf = seg.kind === 'business' ? s.macro.businessConfidence : s.macro.consumerConfidence;
  f.economy = Math.log(Math.max(0.5, 1 + Math.max(0, ind.cyclicality) * (50 - conf) / 100 * mon.macroSensitivity));
  f.support = Math.log(1 + Math.max(0, (s.metrics.responseHours - 24) / 72));
  if (seg.kind === 'business') {
    const accounts = roleCapacity(s, 'cs_manager') * 40 + roleCapacity(s, 'account_manager') * 30;
    const bizCustomers = Math.max(1, s.flags.bizCustomers as number || 1);
    f.account_coverage = Math.log(1 - 0.3 * clamp(accounts / bizCustomers, 0, 1));
  }
  const users = cell.customers;
  f.network = -Math.min(0.4, (industryOf(s).networkEffect + mon.networkBoost) * Math.log1p(users / 5000) * 0.2);
  const emailSpend = s.marketing.budgets.email;
  f.email = Math.log(1 - 0.05 * clamp(emailSpend / 200000, 0, 1));
  const fill = s.metrics.fillRate[p.id] ?? 1;
  if (fill < 0.98) f.availability = Math.log(1 + 0.8 * (1 - fill));
  f.brand = -(s.company.brand - 50) / 250;
  if (p.stage === 'discontinued') f.discontinued = Math.log(6);
  const churnMod = modifier(s, 'churn');
  if (churnMod !== 1) f.events = Math.log(churnMod);
  let lnSum = 0;
  for (const k in f) lnSum += f[k];
  return { rate: clamp(base * Math.exp(lnSum), 0.002, 0.6), factors: f };
}

interface Plan {
  p: Product;
  cell: CustomerCell;
  marketId: string;
  seg: SegmentId;
  newPurchases: number; // buyers who chose us today
  womShare: number;
  freeSignups: number;
  freeConversions: number;
  churn: number;
  freeChurn: number;
  units: number; // demand units today
  expansion: number;
}

function funnelMods(s: SimState) {
  return s.marketing.funnelMods;
}

/** Weighted average intent quality of our awareness sources in a market/segment. */
function sourceQuality(s: SimState, marketId: string, seg: string): number {
  const mix = s.marketing.sourceMix[msKey(marketId, seg)];
  if (!mix) return 1;
  let w = 0;
  let q = 0;
  for (const src in mix) {
    const ch = CHANNELS[src as keyof typeof CHANNELS];
    const quality = ch ? ch.quality : 1.1;
    q += mix[src] * quality;
    w += mix[src];
  }
  return w > 0 ? q / w : 1;
}

function competitorCustomersIn(c: Competitor, key: string): number {
  return c.customers[key] ?? 0;
}

export function dailyMarket(s: SimState): void {
  const ind = industryOf(s);
  const days = dim(s);
  const dt = 1 / days;
  const diff = difficultyOf(s);
  const aud = audienceOf(s);
  const products = launchedProducts(s);
  const discontinued = s.products.filter((p) => p.stage === 'discontinued');
  const segs = segmentsFor(s);
  const season = seasonality(s);
  const demandMod = modifier(s, 'demand') * diff.demandMult;
  const conversionMod = modifier(s, 'conversion');
  const fm = funnelMods(s);
  const plans: Plan[] = [];
  const launchBoost = s.day <= s.marketing.launchBoostUntil ? 1.15 : 1;
  const comps = s.competitors.filter((c) => c.status === 'active');
  let bizCustomers = 0;
  for (const k in s.cells) if (SEGMENTS[s.cells[k].segmentId].kind === 'business') bizCustomers += s.cells[k].customers;
  s.flags.bizCustomers = bizCustomers;

  for (const mkt of s.markets) {
    const compsHere = comps.filter((c) => c.markets.includes(mkt.id));
    const weAreHere = mkt.entered;
    if (!weAreHere && compsHere.length === 0) continue;
    for (const seg of segs) {
      const key = msKey(mkt.id, seg);
      const segDef = SEGMENTS[seg];
      const potential = segmentPotential(s, mkt.id, seg);
      let ours = 0;
      for (const p of products) {
        const c = s.cells[`${p.id}|${mkt.id}|${seg}`];
        if (c) ours += c.customers + c.freeUsers * 0.5;
      }
      let compTotal = 0;
      for (const c of compsHere) compTotal += competitorCustomersIn(c, key);
      const unserved = Math.max(0, potential - ours - compTotal);
      const macro = macroDemandFactor(s, seg);
      const inMarket = unserved * ind.propensity * macro * season * demandMod * dt;

      // Utilities of every offering.
      const compU = compsHere.map((c) => competitorUtility(s, c, mkt.id, seg));
      const compAw = compsHere.map((c) => c.awareness[mkt.id] ?? 0);
      const ourAw = weAreHere ? s.company.awareness[key] ?? 0 : 0;
      const ourParts = weAreHere ? products.map((p) => ourUtility(s, p, mkt.id, seg)) : [];
      const ourU = ourParts.map(sumUtility);
      let denomAll = 1; // outside option: not buying
      for (let i = 0; i < compsHere.length; i++) denomAll += compAw[i] * Math.exp(compU[i]);
      for (let i = 0; i < ourU.length; i++) denomAll += ourAw * Math.exp(ourU[i]);
      const bestComp = compU.length ? Math.max(...compU) : -Infinity;

      // Competitors win customers and lose some.
      for (let i = 0; i < compsHere.length; i++) {
        const c = compsHere[i];
        const eu = Math.exp(compU[i]);
        const pChoose = eu / (denomAll - compAw[i] * eu + eu);
        const won = inMarket * compAw[i] * PRE_CHOICE * pChoose * FUNNEL_BASE.activation;
        const cur = competitorCustomersIn(c, key);
        const ourBest = ourU.length ? Math.max(...ourU) : -Infinity;
        const gap = Math.max(0, ourBest - compU[i]) * Math.min(1, ourAw * 5);
        const cChurn = ind.baseChurn * segDef.churnMult * (1 + 0.18 * gap) * (1 + Math.max(0, ind.cyclicality) * (50 - s.macro.consumerConfidence) / 100);
        c.customers[key] = Math.max(0, cur + won - cur * cChurn * dt);
      }

      if (!weAreHere || ourU.length === 0) continue;
      s.month.funnel.inMarket += inMarket;
      s.month.demandIndex += inMarket;

      // Split interest among our products by relative attractiveness.
      let sumOur = 0;
      for (const u of ourU) sumOur += Math.exp(u);
      const audienceBias = segDef.kind === 'business' ? aud.business : aud.consumer;
      const qMix = sourceQuality(s, mkt.id, seg);
      for (let i = 0; i < products.length; i++) {
        const p = products[i];
        const mon = MONETIZATIONS[p.monetization];
        const eu = Math.exp(ourU[i]);
        const share = eu / sumOur;
        const cell = getCell(s, p.id, mkt.id, seg);
        const bias = audienceBias * (segDef.kind === 'business' ? mon.businessBias : mon.consumerBias);
        const aware = inMarket * ourAw * share;
        const rI = clamp(FUNNEL_BASE.interest * fm.interest * (0.7 + 0.3 * qMix) * Math.min(1.4, bias) * launchBoost, 0, 0.95);
        const rV = clamp(FUNNEL_BASE.visit * fm.visit * (0.8 + 0.4 * s.company.brand / 100), 0, 0.95);
        const rC = clamp(FUNNEL_BASE.consideration * fm.consideration * (0.85 + 0.1 * (s.company.reviewRating - 3.4)), 0, 0.95);
        const rT = clamp(FUNNEL_BASE.trial * fm.trial * mon.trialMult, 0, 0.98);
        const interest = aware * rI;
        const visit = interest * rV;
        // Referrals from happy customers enter at the consideration stage.
        const satF = Math.pow(clamp(p.satisfaction / 60, 0, 2), 2);
        const refRate = 0.02 * satF * (1 + (s.marketing.referralReward > 0 ? 0.6 : 0)) * (1 + (ind.networkEffect + mon.networkBoost));
        const refs = (cell.customers + cell.freeUsers * 0.2) * refRate * dt;
        const consideration = visit * rC + refs;
        const pChoose = eu / (denomAll - ourAw * eu + eu);
        s.month.choiceShare += pChoose;
        s.month.choiceSamples += 1;
        const f = s.month.funnel;
        f.aware += aware;
        f.interest += interest;
        f.visit += visit;
        f.consideration += consideration;
        f.referral += refs;

        const plan: Plan = { p, cell, marketId: mkt.id, seg, newPurchases: 0, womShare: consideration > 0 ? refs / consideration : 0, freeSignups: 0, freeConversions: 0, churn: 0, freeChurn: 0, units: 0, expansion: 0 };

        if (isSalesLed(s, p, seg)) {
          // Sales-led: qualified interest becomes pipeline leads; the sales team closes them.
          setWinShare(s, p.id, mkt.id, seg, pChoose * conversionMod);
          addLeads(s, p.id, mkt.id, seg, consideration);
        } else if (mon.freeTier) {
          const trial = consideration * rT;
          const freeU = eu / Math.exp(ourParts[i].price); // utility without price
          const pFree = freeU / (denomAll - ourAw * eu + freeU);
          plan.freeSignups = trial * pFree * FUNNEL_BASE.activation * fm.activation;
          const conv = 0.035 * fm.purchase * conversionMod * Math.exp(ourParts[i].price * 0.8) * clamp(p.features / 50, 0.5, 1.5);
          plan.freeConversions = cell.freeUsers * clamp(conv, 0, 0.3) * dt;
          plan.freeChurn = cell.freeUsers * 0.09 * dt;
          f.trial += trial;
          f.purchase += plan.freeConversions;
        } else {
          const trial = consideration * rT;
          const purchase = trial * clamp(pChoose * fm.purchase * conversionMod, 0, 0.98);
          plan.newPurchases = purchase * clamp(FUNNEL_BASE.activation * fm.activation, 0, 1);
          f.trial += trial;
          f.purchase += purchase;
        }

        const ch = churnRate(s, p, cell, Math.max(0, bestComp - ourU[i]));
        plan.churn = cell.customers * ch.rate * dt;
        const w = cell.customers * dt;
        if (w > 0) {
          for (const k in ch.factors) addTo(s.month.drv, `churn.${k}`, ch.factors[k] * w);
          addTo(s.month.drv, 'churn.__w', w);
          addTo(s.month.drv, 'churn.__base', Math.log(ch.rate) * w);
        }
        const exp = mon.expansionRate * clamp((p.satisfaction - 40) / 30, -1, 1.5);
        plan.expansion = exp * dt;
        plans.push(plan);
      }
    }
  }

  // Discontinued products: customers wind down quickly.
  for (const p of discontinued) {
    for (const k in s.cells) {
      const cell = s.cells[k];
      if (cell.productId !== p.id || cell.customers <= 0) continue;
      const lost = cell.customers * 0.25 * dt;
      cell.customers -= lost;
      cell.freeUsers *= 1 - 0.25 * dt;
      s.month.churned += lost;
    }
  }

  applyPlans(s, plans, dt);
}

function applyPlans(s: SimState, plans: Plan[], dt: number): void {
  const ind = industryOf(s);
  const isPhysical = physical(s);
  const isService = ind.fulfillment === 'service';
  const gtm = gtmOf(s);

  // 1) Demand units per plan.
  for (const pl of plans) {
    const mon = MONETIZATIONS[pl.p.monetization];
    const upc = unitsPerCustomer(s, pl.seg);
    if (!isPhysical && !isService) continue;
    if (mon.revenueType === 'transactional') {
      pl.units = pl.newPurchases * upc + pl.cell.customers * ind.purchaseFreq * upc * dt;
    } else if (mon.revenueType === 'advertising') {
      pl.units = 0;
    } else {
      pl.units = (pl.cell.customers + pl.freeConversions) * upc * dt;
    }
  }

  // 2) Fill rates: inventory per product, stores per market, service capacity overall.
  const fillProduct = new Map<string, number>();
  if (isPhysical) {
    const demand = new Map<string, number>();
    for (const pl of plans) demand.set(pl.p.id, (demand.get(pl.p.id) ?? 0) + pl.units);
    for (const [pid, d] of demand) {
      const inv = s.inventory[pid];
      const avail = inv ? inv.finished : 0;
      fillProduct.set(pid, d > 1e-9 ? clamp(avail / d, 0, 1) : 1);
    }
  }
  const fillMarket = new Map<string, number>();
  if (ind.requiresStores && s.company.gtm !== 'franchise') {
    const demand = new Map<string, number>();
    for (const pl of plans) demand.set(pl.marketId, (demand.get(pl.marketId) ?? 0) + pl.units);
    for (const [mid, d] of demand) {
      const cap = storeCapacityPerDay(s, mid);
      fillMarket.set(mid, d > 1e-9 ? clamp(cap / d, 0, 1) : 1);
    }
  }
  let fillService = 1;
  if (isService && ind.serviceCapacity > 0) {
    const d = plans.reduce((a, pl) => a + pl.units, 0);
    const cap = serviceCapacityPerDay(s);
    fillService = d > 1e-9 ? clamp(cap / d, 0, 1) : 1;
    s.metrics.serviceCapacity = cap * dim(s);
    s.metrics.serviceUtilization = cap > 0 ? d / cap : d > 0 ? 9.99 : 0;
  }

  // 3) Apply.
  const productFill = new Map<string, { d: number; f: number }>();
  for (const pl of plans) {
    const p = pl.p;
    const mon = MONETIZATIONS[p.monetization];
    const cell = pl.cell;
    const fill = (fillProduct.get(p.id) ?? 1) * (fillMarket.get(pl.marketId) ?? 1) * fillService;
    const pf = productFill.get(p.id) ?? { d: 0, f: 0 };
    pf.d += pl.units;
    pf.f += pl.units * fill;
    productFill.set(p.id, pf);

    // Customers
    const newCust = (pl.newPurchases + pl.freeConversions) * fill;
    s.month.lostUnits += pl.units * (1 - fill);
    cell.freeUsers = Math.max(0, cell.freeUsers + pl.freeSignups - pl.freeConversions - pl.freeChurn);
    cell.customers = Math.max(0, cell.customers - pl.churn);
    s.month.churned += pl.churn;
    s.month.funnel.churn += pl.churn;
    s.month.churnBase += cell.customers * dt;
    if (pl.expansion !== 0 && cell.customers > 0) {
      cell.arpuMult = clamp(cell.arpuMult * (1 + pl.expansion), 0.5, 4);
      s.month.funnel.expansion += cell.customers * pl.expansion;
    }
    const revenueUnit = revenuePerUnitOfActivity(s, p, pl.marketId, pl.seg, cell.arpuMult);
    if (newCust > 0) {
      s.month.funnel.activation += newCust;
      const bySource = attribute(s, pl.marketId, pl.seg, newCust, pl.womShare);
      addCustomers(s, p.id, pl.marketId, pl.seg, newCust, bySource, revenueUnit * 3);
    }

    // Revenue
    const segDef = SEGMENTS[pl.seg];
    const termsDays = Math.max(segDef.paymentTermsDays, gtm.receivableDays);
    let revenue = 0;
    let units = 0;
    const upc = unitsPerCustomer(s, pl.seg);
    switch (mon.revenueType) {
      case 'transactional': {
        units = pl.units * fill;
        if (!isPhysical && !isService) units = (newCust + cell.customers * ind.purchaseFreq * dt) * upc;
        revenue = (units / upc) * revenueUnit;
        break;
      }
      case 'advertising':
        revenue = (cell.customers) * revenueUnit * dt;
        break;
      default: {
        units = pl.units * fill;
        const servedShare = isPhysical || isService ? fill : 1;
        revenue = cell.customers * revenueUnit * dt * servedShare;
      }
    }
    if (revenue > 0) {
      const stream = mon.revenueType === 'transactional' ? 'Product sales' : mon.revenueType === 'take_rate' ? 'Transaction revenue' : mon.revenueType === 'advertising' ? 'Advertising' : 'Subscriptions';
      sell(s, revenue, { productId: p.id, marketId: pl.marketId, segmentId: pl.seg, stream }, termsDays);
      s.month.priceWeighted += revenue;
      if (segDef.kind === 'consumer' && termsDays <= 0 && mon.revenueType !== 'advertising') payCogs(s, 'payment_fees', revenue * 0.02, 'Payment processing');
      // Distribution partners take a share of revenue they help generate.
      const partnerShare = s.partnerships.filter((x) => x.status === 'active' && x.kind === 'distribution' && (!x.marketId || x.marketId === pl.marketId));
      for (const ps of partnerShare) {
        const cut = revenue * ps.revenueShare * ps.strength * 0.3;
        if (cut > 0) {
          payCogs(s, 'partner_share', cut, 'Partner revenue share');
          ps.attributedRevenue += revenue * ps.strength * 0.3;
        }
      }
    }
    s.month.units += units;
    if (units > 0) addTo(s.month.unitsByProduct, p.id, units);

    // Cost of sales
    if (isPhysical && units > 0) {
      const taken = consumeForSale(s, p.id, units);
      p.cumulativeUnits += taken;
      const ship = ind.shippingRatio * ind.basePrice * s.macro.priceLevel * (1 - 0.04 * s.tech.levels.automation);
      if (ship > 0 && s.company.gtm !== 'wholesale' && s.company.gtm !== 'franchise') payCogs(s, 'fulfillment', taken * ship, 'Shipping & fulfillment');
      // Returns and warranty claims
      const returnRate = ind.returnRate * clamp(1.6 - p.quality / 100 + p.defectRate * 3, 0.3, 2) * (p.returnPolicyDays > 14 ? 1.2 : 1);
      const returned = taken * returnRate;
      if (returned > 0 && revenue > 0) {
        const refund = (revenue / Math.max(units, 1e-9)) * returned;
        recordRefund(s, refund);
        moveCash(s, -refund, 'operating', 'Customer refunds');
        const inv = s.inventory[p.id];
        const restock = returned * 0.6;
        const avg = avgFinishedCost(inv) || unitCost(s, p) * 0.9;
        inv.finished += restock;
        inv.finishedValue += restock * avg;
        recordCogs(s, 'materials', -restock * avg);
        inv.damaged += returned * 0.4;
        s.month.returns += returned;
      }
      const warrantyFactor = s.company.warrantyPolicy === 'extended' ? 1.8 : s.company.warrantyPolicy === 'none' ? 0.3 : 1;
      const claims = taken * p.defectRate * warrantyFactor;
      if (claims > 0) payExpense(s, 'warranty', claims * unitCost(s, p) * 0.5, 'Warranty claims');
    } else if (isService && units > 0) {
      p.cumulativeUnits += units;
      payCogs(s, 'materials', units * unitCost(s, p) * Math.max(0.2, ind.materialShare) * gtm.cogsShare, 'Service consumables');
    } else if (!isPhysical && !isService) {
      const hosted = cell.customers + cell.freeUsers * 0.15;
      const unitsServed = hosted * upc;
      p.cumulativeUnits += unitsServed * dt;
      const cost = mon.revenueType === 'take_rate' ? revenue * 0.25 : unitsServed * hostingCost(s, p) * dt * gtm.cogsShare;
      if (cost > 0) payCogs(s, 'hosting', cost, mon.revenueType === 'take_rate' ? 'Processing costs' : 'Hosting & infrastructure');
    }
  }

  for (const [pid, pf] of productFill) {
    const f = pf.d > 1e-9 ? pf.f / pf.d : 1;
    s.metrics.fillRate[pid] = clamp((s.metrics.fillRate[pid] ?? 1) * 0.9 + f * 0.1, 0, 1);
    if (f < 0.95 && pf.d > 1e-6) {
      s.month.stockoutDays += 1 / Math.max(1, productFill.size);
      const inv = s.inventory[pid];
      if (inv) inv.stockoutDays += 1;
    }
  }
}

/** Our revenue share of the whole industry (all markets), using competitor run-rates. */
export function marketShare(s: SimState, ourRevenue: number): number {
  let comp = 0;
  for (const c of s.competitors) if (c.status === 'active') comp += c.revenueHistory[c.revenueHistory.length - 1] ?? 0;
  const total = ourRevenue + comp;
  return total > 0 ? ourRevenue / total : 0;
}

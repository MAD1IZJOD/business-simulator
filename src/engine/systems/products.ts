// Products: costs, development, lifecycle, satisfaction and reviews.
import { MONETIZATIONS } from '../data/businessModels';
import { MANAGEMENT_STYLES } from '../data/roles';
import { SEGMENTS } from '../data/segments';
import type { DevSpeed, Positioning, Product, SimState } from '../types';
import { dim, industryOf, launchedProducts, roleCapacity, customersOfProduct, marketSalaryIndex, physical } from '../context';
import { chance, pick, randNormal, randInt } from '../rng';
import { approach, clamp, uid } from '../util';
import { payExpense } from './ledger';
import { addNews } from './news';
import { createDecision } from './decisionCore';
import { referencePrice } from './pricing';

export const SPEED_MULT: Record<DevSpeed, number> = { lean: 0.8, normal: 1, crunch: 1.35 };

export const POSITIONING_PRICE: Record<Positioning, number> = { budget: 0.7, mainstream: 1, premium: 1.35, luxury: 2.2 };
export const POSITIONING_COST: Record<Positioning, number> = { budget: 0.8, mainstream: 1, premium: 1.2, luxury: 1.6 };

/** Development effort (engineer-months) for a plan. */
export function effortFor(s: SimState, featureScope: number, qualityTarget: number): number {
  const ind = industryOf(s);
  const rapid = s.research.unlocked.includes('rapid_dev') ? 0.75 : 1;
  return Math.max(1, ind.devEffort * Math.pow(Math.max(10, featureScope) / 50, 1.3) * Math.pow(Math.max(20, qualityTarget) / 60, 1.6) * rapid);
}

/** Current variable cost per unit (INR, before supplier/location adjustments). */
export function unitCost(s: SimState, p: Product): number {
  let c = p.baseUnitCost * s.macro.priceLevel;
  if (s.research.unlocked.includes('lean_process')) c *= 0.92;
  if (s.research.unlocked.includes('advanced_materials')) c *= 0.88;
  const learning = p.cumulativeUnits > 2000 ? Math.max(0.72, Math.pow(p.cumulativeUnits / 2000, -0.06)) : 1;
  return c * learning;
}

export function materialCost(s: SimState, p: Product, supplierCostMult = 1, fx = 1): number {
  const ind = industryOf(s);
  return unitCost(s, p) * ind.materialShare * supplierCostMult * fx * (s.modifiers.length ? materialMod(s) : 1);
}

function materialMod(s: SimState): number {
  let v = 1;
  for (const m of s.modifiers) if (m.target === 'material_cost' && m.startDay <= s.day && m.endDay >= s.day) v *= m.value;
  return v;
}

/** Variable conversion cost (energy & consumables) per manufactured unit. */
export function conversionCost(s: SimState, p: Product): number {
  const ind = industryOf(s);
  let energy = 1 - 0.06 * s.tech.levels.manufacturing;
  if (s.research.unlocked.includes('green_ops')) energy *= 0.85;
  let e = 1;
  for (const m of s.modifiers) if (m.target === 'energy_cost' && m.startDay <= s.day && m.endDay >= s.day) e *= m.value;
  return unitCost(s, p) * (1 - ind.materialShare) * 0.5 * energy * e;
}

/** Hosting / servicing cost per customer-month for digital products. */
export function hostingCost(s: SimState, p: Product): number {
  return unitCost(s, p) * (1 - 0.08 * s.tech.levels.infrastructure);
}

export function defaultPrice(s: SimState, positioning: Positioning, monetization = industryOf(s).defaultMonetization): number {
  const ind = industryOf(s);
  const rt = MONETIZATIONS[monetization].revenueType;
  if (rt === 'take_rate') return ind.takeRate > 0 ? ind.takeRate : 10;
  if (rt === 'advertising') return 0;
  const ref = referencePrice(s, s.config.hqMarket, 'consumers');
  return Math.round((ref / s.macro.priceLevel) * POSITIONING_PRICE[positioning]);
}

export function newProduct(s: SimState, opts: { name: string; category: string; positioning: Positioning; monetization: Product['monetization']; qualityTarget: number; featureScope: number; monthlyBudget: number; speed: DevSpeed; price?: number }): Product {
  const ind = industryOf(s);
  const effort = effortFor(s, opts.featureScope, opts.qualityTarget);
  const nextGen = s.research.unlocked.includes('next_gen') ? 10 : 0;
  const price = opts.price ?? defaultPrice(s, opts.positioning, opts.monetization);
  const base = ind.basePrice * ind.unitCostRatio * POSITIONING_COST[opts.positioning] * (0.8 + opts.qualityTarget / 250);
  const rt = MONETIZATIONS[opts.monetization].revenueType;
  return {
    id: uid(s, 'p'),
    name: opts.name,
    category: opts.category,
    monetization: opts.monetization,
    positioning: opts.positioning,
    stage: 'development',
    phase: 'development',
    quality: 0,
    features: 0,
    price,
    baseUnitCost: rt === 'take_rate' ? ind.gmvPerUnit * (ind.takeRate / 100) * ind.unitCostRatio : base,
    dev: {
      monthlyBudget: opts.monthlyBudget,
      qualityTarget: clamp(opts.qualityTarget + nextGen, 10, 100),
      featureScope: clamp(opts.featureScope + nextGen, 5, 100),
      speed: opts.speed,
      engineeringShare: 1,
      progress: 0,
      effortRequired: effort,
      spent: 0,
      defectRisk: 0,
    },
    launchDay: null,
    discontinuedDay: null,
    novelty: 1,
    satisfaction: 60,
    defectRate: 0.02,
    techDebt: 5,
    warrantyMonths: physical(s) ? 12 : 0,
    returnPolicyDays: physical(s) ? 10 : 0,
    patent: null,
    acquired: false,
    lastPrice: price,
    priceChangedDay: null,
    sellers: opts.monetization === 'marketplace' ? 50 : 0,
    ecosystem: 0,
    platformInvestment: 0,
    adLoad: 5,
    developmentCost: 0,
    updating: false,
    readyNotified: false,
    launchStrategy: null,
    cumulativeUnits: 0,
  };
}

/** Engineering capacity (dev points / month) from engineers, PMs and designers. */
export function engineeringCapacity(s: SimState): number {
  const eng = roleCapacity(s, 'engineer') + roleCapacity(s, 'data_scientist') * 0.6 + roleCapacity(s, 'specialist') * (industryOf(s).fulfillment === 'digital' ? 0.3 : 0);
  const pm = roleCapacity(s, 'product_manager');
  const pmFactor = eng > 0 ? 0.75 + 0.25 * Math.min(1, (pm * 6) / eng) : 1;
  const culture = 0.85 + 0.3 * (s.company.culture.executionSpeed / 100);
  return eng * pmFactor * culture;
}

function devShares(s: SimState): Map<string, number> {
  const active = s.products.filter((p) => (p.stage === 'development' && p.dev.progress < 1) || p.updating);
  const total = active.reduce((a, p) => a + p.dev.engineeringShare, 0);
  const map = new Map<string, number>();
  // Launched products need maintenance: reserve up to 30% of capacity for tech debt.
  const maintenance = launchedProducts(s).length > 0 ? 0.25 : 0;
  for (const p of active) map.set(p.id, total > 0 ? (p.dev.engineeringShare / total) * (1 - maintenance) : 0);
  return map;
}

export function dailyDevelopment(s: SimState): void {
  const days = dim(s);
  const cap = engineeringCapacity(s);
  s.metrics.engineeringCapacity = cap;
  const shares = devShares(s);
  const labor = marketSalaryIndex(s.config.hqMarket);
  for (const p of s.products) {
    const inDev = (p.stage === 'development' && p.dev.progress < 1) || p.updating;
    if (!inDev) continue;
    const share = shares.get(p.id) ?? 0;
    const budgetPoints = p.dev.monthlyBudget / (150000 * labor);
    const points = (cap * share * SPEED_MULT[p.dev.speed] + budgetPoints * SPEED_MULT[p.dev.speed]) / days;
    const spend = p.dev.monthlyBudget / days;
    if (spend > 0) {
      payExpense(s, 'rd', spend, 'Product development');
      p.dev.spent += spend;
      p.developmentCost += spend;
    }
    p.dev.progress = Math.min(1, p.dev.progress + points / p.dev.effortRequired);
    // Risk accumulates with crunch and underfunding relative to scope.
    if (p.dev.speed === 'crunch') p.dev.defectRisk += 0.04 / days;
    if (p.dev.speed === 'lean') p.dev.defectRisk = Math.max(0, p.dev.defectRisk - 0.01 / days);
    const intensity = (cap * share + budgetPoints) / Math.max(0.5, p.dev.effortRequired / industryOf(s).devMonthsBase);
    if (intensity < 0.6) p.dev.defectRisk += 0.015 / days;
    if (p.dev.progress >= 1) completeDevelopment(s, p);
  }
}

function avgSkill(s: SimState, roles: string[]): number {
  const es = s.employees.filter((e) => roles.includes(e.role));
  if (!es.length) return 50;
  return es.reduce((a, e) => a + e.skill, 0) / es.length;
}

function completeDevelopment(s: SimState, p: Product): void {
  const skill = avgSkill(s, ['engineer', 'data_scientist', 'founder']);
  const designers = roleCapacity(s, 'designer');
  const designBonus = Math.min(6, designers * 2);
  const mgmt = MANAGEMENT_STYLES[s.company.managementStyle].qualityBonus;
  const disciplineBonus = (s.company.culture.discipline - 50) / 25;
  const noise = randNormal(s, 0, 3);
  const q = clamp(p.dev.qualityTarget * Math.pow(skill / 60, 0.25) * (1 - p.dev.defectRisk * 0.35) + designBonus + mgmt + disciplineBonus + noise, 5, 100);
  const f = clamp(p.dev.featureScope + randNormal(s, 0, 3), 5, 100);
  if (p.updating) {
    p.updating = false;
    const oldQ = p.quality;
    p.quality = clamp(Math.max(p.quality, q), 0, 100);
    p.features = clamp(Math.max(p.features, f), 0, 100);
    p.novelty = Math.min(1.25, p.novelty + 0.25);
    p.techDebt = Math.max(0, p.techDebt - 15);
    p.defectRate = clamp(0.01 + p.dev.defectRisk * 0.08, 0.005, 0.25);
    p.dev.progress = 1;
    addNews(s, `${s.company.name} ships a major update to ${p.name}`, `Quality ${oldQ.toFixed(0)} → ${p.quality.toFixed(0)}. Refreshed products regain appeal with customers.`, 'company', 'positive');
    return;
  }
  p.quality = q;
  p.features = f;
  p.defectRate = clamp(0.01 + p.dev.defectRisk * 0.1 + (60 - skill) / 1500, 0.004, 0.3);
  if (!p.readyNotified) {
    p.readyNotified = true;
    createLaunchDecision(s, p);
  }
}

export function createLaunchDecision(s: SimState, p: Product): void {
  const ind = industryOf(s);
  createDecision(s, {
    kind: 'launch_strategy',
    category: 'decision',
    title: `${p.name} is ready. Choose your launch strategy.`,
    description: `Development is complete: quality ${p.quality.toFixed(0)}/100, features ${p.features.toFixed(0)}/100. How you launch shapes early awareness, pricing perception and cash burn.${physical(s) ? ' Physical products need inventory before they can sell — check Operations.' : ''}`,
    days: 30,
    options: [
      { id: 'soft', label: 'Soft launch', description: 'Quiet launch to early adopters. Preserve cash, learn from feedback.', consequences: ['Small awareness boost', 'No extra marketing spend', `Keeps the ${ind.priceUnit} price as set`] },
      { id: 'balanced', label: 'Balanced launch', description: 'Moderate campaign across social and search for two months.', consequences: ['+₹ marketing on social & paid search', 'Moderate awareness boost', 'Launch hype for 45 days'] },
      { id: 'big_bang', label: 'Big-bang launch', description: 'Heavy two-month campaign across every major channel.', consequences: ['Large marketing spend', 'Big awareness and brand boost', 'Burns cash fast'] },
      { id: 'penetration', label: 'Penetration pricing', description: 'Launch 20% below list price to grab share, then raise later.', consequences: ['Price −20%', 'Higher conversion, lower margin', 'Price rises later can raise churn'] },
      { id: 'premium', label: 'Premium positioning', description: 'Launch 25% above list price with a brand-led story.', consequences: ['Price +25%', 'Brand boost', 'Lower conversion among price-sensitive buyers'] },
    ],
    defaultOption: 'soft',
    data: { productId: p.id },
  });
}

export function launchProduct(s: SimState, p: Product, strategy: string): string[] {
  if (p.stage !== 'development' || p.dev.progress < 1) return ['Product is not ready to launch.'];
  p.stage = 'launched';
  p.phase = 'launch';
  p.launchDay = s.day;
  p.launchStrategy = strategy;
  p.lastPrice = p.price;
  const effects: string[] = [];
  const mk = s.marketing;
  const scaleBudget = (base: number) => Math.round(base * Math.max(0.3, Math.min(4, s.finance.cash / 5000000)));
  switch (strategy) {
    case 'balanced': {
      const b = scaleBudget(150000);
      mk.budgets.social += b;
      mk.budgets.paid_search += Math.round(b * 0.7);
      mk.launchBoostUntil = s.day + 45;
      effects.push(`Social +${b.toLocaleString('en-IN')}/mo, paid search +${Math.round(b * 0.7).toLocaleString('en-IN')}/mo`);
      break;
    }
    case 'big_bang': {
      const b = scaleBudget(400000);
      mk.budgets.social += b;
      mk.budgets.paid_search += Math.round(b * 0.6);
      mk.budgets.influencer += Math.round(b * 0.5);
      mk.launchBoostUntil = s.day + 60;
      s.company.brand = Math.min(100, s.company.brand + 3);
      effects.push(`Marketing +${Math.round(b * 2.1).toLocaleString('en-IN')}/mo across social, search and influencers`, 'Brand +3');
      break;
    }
    case 'penetration':
      p.price = Math.round(p.price * 0.8 * 100) / 100;
      p.lastPrice = p.price;
      effects.push('Price reduced 20%');
      mk.launchBoostUntil = s.day + 30;
      break;
    case 'premium':
      p.price = Math.round(p.price * 1.25 * 100) / 100;
      p.lastPrice = p.price;
      s.company.brand = Math.min(100, s.company.brand + 2);
      effects.push('Price raised 25%', 'Brand +2');
      mk.launchBoostUntil = s.day + 20;
      break;
    default:
      mk.launchBoostUntil = s.day + 20;
      effects.push('Quiet launch to early adopters');
  }
  // Launch buzz: awareness bump in entered markets.
  const bump = strategy === 'big_bang' ? 0.02 : strategy === 'balanced' ? 0.01 : 0.004;
  for (const k in s.company.awareness) s.company.awareness[k] = Math.min(1, s.company.awareness[k] + bump);
  p.novelty = strategy === 'big_bang' ? 1.15 : 1.05;
  addNews(s, `${s.company.name} launches ${p.name}`, `A new ${p.category.toLowerCase()} enters the market (quality ${p.quality.toFixed(0)}). Launch strategy: ${strategy.replace('_', ' ')}.`, 'company', 'positive');
  return effects;
}

/** Monthly lifecycle, tech debt, defects and satisfaction update. */
export function monthlyProducts(s: SimState): void {
  const ind = industryOf(s);
  const mdays = 30.4;
  for (const p of s.products) {
    if (p.stage === 'development') {
      p.phase = p.dev.progress >= 1 ? 'launch' : 'development';
      continue;
    }
    if (p.stage !== 'launched') continue;
    const age = (s.day - (p.launchDay ?? s.day)) / mdays;
    const recentCompLaunches = s.competitors.filter((c) => c.status === 'active' && s.day - c.lastLaunchDay < 60).length;
    if (age < 1) p.phase = 'launch';
    else if (age < ind.growthMonths) p.phase = 'growth';
    else if (age < ind.growthMonths + ind.maturityMonths) p.phase = 'maturity';
    else p.phase = 'decline';
    if (p.phase === 'growth') p.novelty = approach(p.novelty, 1.12, 0.1);
    else if (p.phase === 'maturity') p.novelty = approach(p.novelty, 1, 0.08);
    else if (p.phase === 'decline') p.novelty = Math.max(0.3, p.novelty * (1 - ind.obsolescence * (1 + 0.3 * recentCompLaunches)));
    if (p.phase !== 'decline') p.novelty = Math.max(0.3, p.novelty - ind.obsolescence * 0.15 * recentCompLaunches);

    // Tech debt grows with usage and shrinks with maintenance capacity.
    const users = customersOfProduct(s, p.id);
    const launched = launchedProducts(s).length || 1;
    const maintenance = (s.metrics.engineeringCapacity * 0.25) / launched;
    const load = Math.log10(10 + users);
    p.techDebt = clamp(p.techDebt + load * 0.8 - maintenance * 1.2, 0, 100);

    // Defects: physical products depend on supplier/factory quality; digital on tech debt.
    const qs = s.research.unlocked.includes('quality_systems') ? 0.8 : 1;
    if (physical(s)) {
      const supQ = s.suppliers.filter((x) => x.status === 'active').reduce((a, x) => a + x.quality, 0) / Math.max(1, s.suppliers.filter((x) => x.status === 'active').length);
      const cond = s.factories.length ? s.factories.reduce((a, f) => a + f.condition, 0) / s.factories.length : 80;
      const target = (0.012 + (70 - (supQ || 60)) / 2500 + (80 - cond) / 2500) * (1 - 0.12 * s.tech.levels.manufacturing) * qs * defectsMod(s);
      p.defectRate = clamp(approach(p.defectRate, target, 0.3), 0.002, 0.3);
    } else {
      const target = (0.006 + p.techDebt / 2500) * qs * defectsMod(s);
      p.defectRate = clamp(approach(p.defectRate, target, 0.3), 0.002, 0.3);
    }
    // Marketplace supply side grows with buyers and platform investment.
    if (p.monetization === 'marketplace') {
      const target = 50 + users / 12 + p.platformInvestment / 4000;
      p.sellers = approach(p.sellers, target, 0.15);
    }
    if (p.platformInvestment > 0) {
      payExpense(s, 'rd', p.platformInvestment, 'Platform & API program');
      p.ecosystem += p.platformInvestment / 50000 + users / 20000;
    } else {
      p.ecosystem *= 0.98;
    }
    p.lastPrice = p.price;
  }
}

function defectsMod(s: SimState): number {
  let v = 1;
  for (const m of s.modifiers) if (m.target === 'defects' && m.startDay <= s.day && m.endDay >= s.day) v *= m.value;
  return v;
}

/** Satisfaction target from quality, value for money, support, fulfillment and defects. */
export function satisfactionDrivers(s: SimState, p: Product): { label: string; value: number }[] {
  const ind = industryOf(s);
  const ref = referencePrice(s, s.config.hqMarket, 'consumers', p);
  const rt = MONETIZATIONS[p.monetization].revenueType;
  const price = rt === 'take_rate' ? p.price : rt === 'advertising' ? p.adLoad : p.price * (s.markets.find((m) => m.id === s.config.hqMarket)?.priceMult ?? 1);
  const valueTerm = rt === 'advertising' ? -(p.adLoad - 5) * 3 : clamp(-14 * Math.log(Math.max(price, 1e-6) / ref), -25, 15);
  const fill = s.metrics.fillRate[p.id] ?? 1;
  return [
    { label: 'Product quality', value: (p.quality - 50) * 0.55 },
    { label: 'Features', value: (p.features - 50) * 0.12 },
    { label: 'Value for money', value: valueTerm },
    { label: 'Support responsiveness', value: clamp(-(s.metrics.responseHours - 12) / 2.5, -20, 6) },
    { label: 'Availability / fulfillment', value: -(1 - fill) * 45 },
    { label: 'Defects & reliability', value: -p.defectRate * 120 - (100 - s.metrics.reliability) * 0.15 },
    { label: 'Tech debt', value: ind.fulfillment === 'digital' ? -p.techDebt * 0.08 : 0 },
  ];
}

export function updateSatisfaction(s: SimState): void {
  for (const p of launchedProducts(s)) {
    const target = clamp(58 + satisfactionDrivers(s, p).reduce((a, d) => a + d.value, 0), 0, 100);
    p.satisfaction = clamp(approach(p.satisfaction, target, 0.35), 0, 100);
  }
}

const REVIEW_TEMPLATES: Record<string, { pos: string[]; neg: string[] }> = {
  'Product quality': { pos: ['Genuinely well made — it just works.', 'Quality is excellent, better than alternatives I tried.'], neg: ['Feels half-finished. Quality needs work.', 'Disappointed with the build quality.'] },
  Features: { pos: ['Has every feature I need.', 'Feature set is impressively complete.'], neg: ['Missing basic features competitors have.', 'Too bare-bones for the price.'] },
  'Value for money': { pos: ['Great value for what you pay.', 'Priced fairly — no complaints.'], neg: ['Way overpriced for what it is.', 'Too expensive. Switching when my plan ends.'] },
  'Support responsiveness': { pos: ['Support replied within minutes. Impressive.', 'Helpful, fast support team.'], neg: ['Waited days for a support reply.', 'Support is unreachable.'] },
  'Availability / fulfillment': { pos: ['Delivered quickly, always in stock.', 'Never had trouble getting it.'], neg: ['Out of stock again. Frustrating.', 'Could not get it when I needed it.'] },
  'Defects & reliability': { pos: ['Rock solid, zero issues so far.', 'Reliable every single day.'], neg: ['Mine broke within weeks.', 'Constant glitches and outages.'] },
  'Tech debt': { pos: ['Fast and smooth.', 'Snappy and polished.'], neg: ['Getting slower and buggier with every update.', 'Feels clunky lately.'] },
};

export function generateReviews(s: SimState): void {
  const segs = Object.keys(industryOf(s).adoption) as (keyof typeof SEGMENTS)[];
  for (const p of launchedProducts(s)) {
    const users = customersOfProduct(s, p.id);
    if (users < 1) continue;
    const drivers = satisfactionDrivers(s, p).filter((d) => d.value !== 0);
    const n = Math.min(4, 1 + Math.floor(Math.log10(1 + users)));
    for (let i = 0; i < n; i++) {
      const rating = clamp(Math.round(1 + (p.satisfaction / 100) * 4 + randNormal(s, 0, 0.8)), 1, 5);
      const sorted = [...drivers].sort((a, b) => (rating >= 3 ? b.value - a.value : a.value - b.value));
      const d = sorted[Math.min(sorted.length - 1, randInt(s, 0, 1))];
      const tmpl = REVIEW_TEMPLATES[d?.label ?? 'Product quality'] ?? REVIEW_TEMPLATES['Product quality'];
      const text = rating >= 4 ? pick(s, tmpl.pos) : rating <= 2 ? pick(s, tmpl.neg) : chance(s, 0.5) ? pick(s, tmpl.pos) + ' But ' + pick(s, tmpl.neg).toLowerCase() : pick(s, tmpl.neg);
      s.company.reviews.unshift({ id: uid(s, 'rv'), day: s.day, productId: p.id, rating, text, segmentId: pick(s, segs) });
    }
  }
  if (s.company.reviews.length > 60) s.company.reviews.length = 60;
  const recent = s.company.reviews.slice(0, 30);
  if (recent.length) {
    const avg = recent.reduce((a, r) => a + r.rating, 0) / recent.length;
    s.company.reviewRating = approach(s.company.reviewRating, avg, 0.5);
  }
}

export function productName(s: SimState, id: string): string {
  return s.products.find((p) => p.id === id)?.name ?? 'Product';
}

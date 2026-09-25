// Factories turn material kits into finished goods. Throughput is limited by
// production lines, machine condition, crew staffing and available materials.
// Conversion costs (energy, consumables) are capitalised into inventory value.
import { MARKET_BY_ID } from '../data/markets';
import type { Factory, SimState } from '../types';
import { dim, industryOf, roleCapacity } from '../context';
import { clamp, uid } from '../util';
import { moveCash, payExpense, recordOpex } from './ledger';
import { addFinished, takeRaw } from './inventory';
import { conversionCost } from './products';
import { addNews } from './news';
import { addAsset } from './assets';

export const CREW_PER_LINE = 8;

export function lineCapacityPerDay(s: SimState): number {
  const ind = industryOf(s);
  // A line produces roughly ₹2.5 lakh of output value per day at list price.
  return Math.max(1, Math.round(250000 / Math.max(20, ind.basePrice)));
}

export function factoryCost(s: SimState, marketId: string, lines: number): number {
  const ind = industryOf(s);
  const m = MARKET_BY_ID[marketId];
  return (20000000 + lines * 15000000) * (0.4 + ind.capitalIntensity) * Math.max(0.6, m.rentIndex) * s.macro.priceLevel;
}

export function lineCost(s: SimState, marketId: string): number {
  const ind = industryOf(s);
  return 15000000 * (0.4 + ind.capitalIntensity) * Math.max(0.6, MARKET_BY_ID[marketId].rentIndex) * s.macro.priceLevel;
}

export function buildFactory(s: SimState, marketId: string, lines: number, owned: boolean): { ok: boolean; message: string } {
  const ind = industryOf(s);
  if (ind.fulfillment !== 'manufactured') return { ok: false, message: `${ind.name} companies do not run factories.` };
  lines = clamp(Math.round(lines), 1, 20);
  const cost = factoryCost(s, marketId, lines);
  const upfront = owned ? cost : cost * 0.15; // leased: fit-out only
  if (s.finance.cash < upfront) return { ok: false, message: `Not enough cash: need ₹${Math.round(upfront).toLocaleString('en-IN')}.` };
  const f: Factory = {
    id: uid(s, 'f'),
    name: `${MARKET_BY_ID[marketId].name} Plant ${s.factories.length + 1}`,
    marketId,
    lines,
    linesUnderConstruction: 0,
    constructionDoneDay: 0,
    capacityPerLine: lineCapacityPerDay(s),
    condition: 95,
    maintenanceBudget: Math.round(lines * 60000 * s.macro.priceLevel),
    owned,
    rent: owned ? 0 : Math.round((cost * 0.85) / 120),
    utilization: 0,
    status: 'building',
    readyDay: s.day + 150,
    energyPerUnit: 0,
  };
  s.factories.push(f);
  addAsset(s, `${f.name}${owned ? '' : ' fit-out'}`, owned ? 'factory' : 'equipment', upfront, owned ? 240 : 120);
  moveCash(s, -upfront, 'investing', 'Factory construction');
  addNews(s, `${s.company.name} breaks ground on a factory in ${MARKET_BY_ID[marketId].name}`, `${lines} production lines, ready in about 5 months.`, 'company', 'positive');
  return { ok: true, message: `Construction started: ${lines} lines, ready in ~150 days. Cost ₹${Math.round(upfront).toLocaleString('en-IN')}.` };
}

export function addLines(s: SimState, factoryId: string, n: number): { ok: boolean; message: string } {
  const f = s.factories.find((x) => x.id === factoryId);
  if (!f) return { ok: false, message: 'Factory not found.' };
  n = clamp(Math.round(n), 1, 10);
  const cost = lineCost(s, f.marketId) * n;
  if (s.finance.cash < cost) return { ok: false, message: `Not enough cash: need ₹${Math.round(cost).toLocaleString('en-IN')}.` };
  f.linesUnderConstruction += n;
  f.constructionDoneDay = s.day + 60;
  addAsset(s, `${f.name} lines`, 'equipment', cost, 120);
  moveCash(s, -cost, 'investing', 'Production equipment');
  return { ok: true, message: `${n} new line(s) ready in 60 days. Cost ₹${Math.round(cost).toLocaleString('en-IN')}.` };
}

function staffing(s: SimState, totalLines: number): number {
  if (totalLines <= 0) return 0;
  const crew = roleCapacity(s, 'production_worker') * (1 + 0.06 * s.tech.levels.automation);
  return clamp(crew / (totalLines * CREW_PER_LINE), 0, 1.15);
}

export function factoryCapacityPerDay(s: SimState): number {
  const ops = s.factories.filter((f) => f.status === 'operational');
  const lines = ops.reduce((a, f) => a + f.lines, 0);
  const staff = staffing(s, lines);
  const tech = 1 + 0.07 * s.tech.levels.manufacturing;
  return ops.reduce((a, f) => a + f.lines * f.capacityPerLine * (0.5 + 0.5 * f.condition / 100), 0) * tech * staff;
}

/** Daily production across products. */
export function dailyManufacturing(s: SimState): void {
  const days = dim(s);
  for (const f of s.factories) {
    if (f.status === 'building' && f.readyDay <= s.day) {
      f.status = 'operational';
      addNews(s, `${f.name} starts production`, `${f.lines} lines online.`, 'company', 'positive');
    }
    if (f.linesUnderConstruction > 0 && f.constructionDoneDay <= s.day) {
      f.lines += f.linesUnderConstruction;
      f.linesUnderConstruction = 0;
    }
  }
  const cap = factoryCapacityPerDay(s);
  if (cap <= 0) {
    for (const f of s.factories) f.utilization = 0;
    return;
  }
  const products = s.products.filter((p) => p.stage === 'launched' || (p.stage === 'development' && p.dev.progress >= 1));
  // Production plan: explicit targets, otherwise aim for ~30 days of cover.
  const wants = products.map((p) => {
    const inv = s.inventory[p.id];
    if (!inv) return 0;
    if (inv.productionTarget > 0) return inv.productionTarget;
    const daily = expectedDailyDemand(s, p.id) || cap / Math.max(1, products.length);
    const cover = inv.finished / Math.max(1e-6, daily);
    return cover < 30 ? daily * (1.2 + (30 - cover) / 30) : cover < 45 ? daily : 0;
  });
  const totalWant = wants.reduce((a, b) => a + b, 0);
  const scale = totalWant > cap ? cap / totalWant : 1;
  const tech = s.tech.levels.manufacturing;
  let produced = 0;
  let defects = 0;
  products.forEach((p, i) => {
    const inv = s.inventory[p.id];
    const want = wants[i] * scale;
    if (!inv || want <= 0) return;
    const [kits, matCost] = takeRaw(inv, want);
    if (kits <= 0) return;
    const cond = s.factories.reduce((a, f) => a + f.condition, 0) / Math.max(1, s.factories.length);
    const scrapRate = clamp((0.03 + (85 - cond) / 800) * (1 - 0.12 * tech) * (s.research.unlocked.includes('quality_systems') ? 0.8 : 1), 0.004, 0.25);
    const good = kits * (1 - scrapRate);
    const conv = conversionCost(s, p) * kits;
    moveCash(s, -conv, 'operating', 'Production energy & consumables');
    const scrapShare = kits > 0 ? (kits - good) / kits : 0;
    recordOpex(s, 'writeoffs', (matCost + conv) * scrapShare);
    addFinished(inv, good, (matCost + conv) * (1 - scrapShare));
    produced += good;
    defects += kits - good;
  });
  s.month.produced += produced;
  s.month.defects += defects;
  for (const f of s.factories) {
    if (f.status !== 'operational') continue;
    f.utilization = clamp((produced + defects) / Math.max(1, cap), 0, 1.2);
    f.condition = clamp(f.condition - (0.06 * f.utilization) / (days / 30), 0, 100);
  }
}

/** Expected units/day: the higher of this month's pace and last month's average. */
export function expectedDailyDemand(s: SimState, productId: string): number {
  const elapsed = Math.max(1, s.day - Number(s.flags.monthStartDay ?? s.day) + 1);
  const thisMonth = (s.month.unitsByProduct[productId] ?? 0) / elapsed;
  const lastMonth = Number(s.flags[`lastUnits|${productId}`] ?? 0) / 30;
  return Math.max(thisMonth, lastMonth);
}

/** Monthly: rent, maintenance (restores machine condition). */
export function monthlyManufacturing(s: SimState): void {
  for (const f of s.factories) {
    if (!f.owned && f.rent > 0) payExpense(s, 'rent', f.rent, 'Factory lease');
    if (f.maintenanceBudget > 0) {
      payExpense(s, 'maintenance', f.maintenanceBudget, 'Machine maintenance');
      const perLine = f.maintenanceBudget / Math.max(1, f.lines) / 60000;
      f.condition = clamp(f.condition + 4 * Math.min(2, perLine), 0, 100);
    }
  }
}

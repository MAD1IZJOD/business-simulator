// Competitors are independent firms with their own cash, customers, prices,
// quality, marketing and strategy. Each month they react to the market (and to
// us) according to their strategy, raise money, launch products, expand, shrink
// or go bankrupt. Their customers come from the same market model as ours.
import { MONETIZATIONS } from '../data/businessModels';
import { MARKETS, MARKET_BY_ID } from '../data/markets';
import { SEGMENTS } from '../data/segments';
import type { Competitor, CompetitorStrategy, RoundKind, SegmentId, SimState } from '../types';
import { difficultyOf, industryOf, segmentsFor } from '../context';
import { chance, pick, randNormal, randRange } from '../rng';
import { approach, clamp, msKey, saturate, uid } from '../util';
import { addNews } from './news';
import { fundingClimate } from './macro';
import { referencePrice } from './pricing';
import { segmentPotential, unitsPerCustomer } from './market';

const STRATEGIES: CompetitorStrategy[] = ['price_leader', 'premium', 'innovator', 'fast_follower', 'aggressive_growth', 'niche'];

const STRATEGY_PARAMS: Record<CompetitorStrategy, { price: number; quality: number; marketing: number; rd: number; launch: number }> = {
  price_leader: { price: 0.78, quality: 48, marketing: 0.12, rd: 0.2, launch: 0.03 },
  premium: { price: 1.35, quality: 70, marketing: 0.15, rd: 0.35, launch: 0.03 },
  innovator: { price: 1.1, quality: 66, marketing: 0.14, rd: 0.7, launch: 0.07 },
  fast_follower: { price: 0.95, quality: 55, marketing: 0.13, rd: 0.3, launch: 0.05 },
  aggressive_growth: { price: 0.88, quality: 56, marketing: 0.3, rd: 0.3, launch: 0.05 },
  niche: { price: 1.15, quality: 62, marketing: 0.08, rd: 0.3, launch: 0.03 },
};

export function generateCompetitors(s: SimState): Competitor[] {
  const ind = industryOf(s);
  const diff = difficultyOf(s);
  const hqCountry = MARKET_BY_ID[s.config.hqMarket].country;
  let count = Math.round(2 + ind.competition * 3 * Math.min(1.3, diff.competitorAggression));
  if (s.config.difficulty === 'sandbox') count = s.config.sandbox.competitorCount;
  count = clamp(count, 0, ind.competitorNames.length);
  const out: Competitor[] = [];
  const names = [...ind.competitorNames];
  for (let i = 0; i < count; i++) {
    const strategy = STRATEGIES[(i + Math.floor(randRange(s, 0, 6))) % STRATEGIES.length];
    const sp = STRATEGY_PARAMS[strategy];
    const name = names.splice(Math.floor(randRange(s, 0, names.length)), 1)[0];
    const size = randRange(s, 0.4, 1.6) * (i === 0 ? 1.6 : 1);
    const home = MARKETS.filter((m) => m.country === hqCountry).map((m) => m.id);
    const markets = [...home];
    for (const m of MARKETS) if (!markets.includes(m.id) && chance(s, 0.25 * size)) markets.push(m.id);
    const c: Competitor = {
      id: uid(s, 'cmp'),
      name,
      strategy,
      priceIndex: sp.price * randRange(s, 0.93, 1.07),
      quality: clamp(sp.quality + randNormal(s, 0, 5), 30, 85),
      brand: clamp(40 + size * 15 + randNormal(s, 0, 6), 15, 85),
      cash: 0,
      marketingSpend: 0,
      headcount: 0,
      avgSalary: 110000,
      grossMargin: clamp(ind.competitorMargin + randNormal(s, 0, 0.04), 0.08, 0.9),
      customers: {},
      awareness: {},
      markets,
      products: 1 + Math.floor(size * 2),
      lastLaunchDay: -9999,
      fundingStage: size > 1.2 ? 'series_b' : size > 0.8 ? 'series_a' : 'seed',
      totalRaised: 0,
      revenueHistory: [],
      headcountHistory: [],
      status: 'active',
      negativeCashMonths: 0,
      valuation: 0,
      novelty: 1,
      priceWarUntil: -1,
      intelNoise: randNormal(s, 0, 1),
      patents: strategy === 'innovator' ? 2 : 0,
    };
    // Established customer bases: incumbents already serve part of the market.
    const penetration = 0.3 * ind.competition * size / Math.max(1, count * 0.6);
    for (const mid of markets) {
      c.awareness[mid] = clamp(0.12 + 0.35 * size * (home.includes(mid) ? 1 : 0.5) + randNormal(s, 0, 0.04), 0.03, 0.85);
      for (const seg of segmentsFor(s)) {
        const pot = segmentPotential(s, mid, seg);
        c.customers[msKey(mid, seg)] = pot * penetration * (home.includes(mid) ? 1 : 0.35) * randRange(s, 0.6, 1.3);
      }
    }
    const rev = competitorRevenue(s, c);
    c.headcount = Math.max(8, Math.round((rev * 12) / revenuePerHead(s)));
    c.marketingSpend = rev * sp.marketing;
    c.cash = Math.max(rev * 6, 20000000 * size);
    c.totalRaised = c.cash;
    c.revenueHistory = [rev, rev, rev];
    c.headcountHistory = [c.headcount];
    c.valuation = rev * 12 * ind.multiple;
    out.push(c);
  }
  return out;
}

function revenuePerHead(s: SimState): number {
  const ind = industryOf(s);
  // Annual revenue per employee, INR.
  return ind.fulfillment === 'digital' ? 6000000 : ind.fulfillment === 'service' ? 3000000 : 9000000;
}

/** Monthly revenue a competitor earns from its customer base (INR). */
export function competitorRevenue(s: SimState, c: Competitor): number {
  const ind = industryOf(s);
  const rt = MONETIZATIONS[ind.defaultMonetization].revenueType;
  let rev = 0;
  for (const key in c.customers) {
    const n = c.customers[key];
    if (n <= 0) continue;
    const [mid, seg] = key.split('|') as [string, SegmentId];
    if (!MARKET_BY_ID[mid] || !SEGMENTS[seg]) continue;
    const upc = unitsPerCustomer(s, seg);
    if (rt === 'take_rate') rev += n * ind.gmvPerUnit * upc * Math.sqrt(MARKET_BY_ID[mid].income) * s.macro.priceLevel * (ind.takeRate * c.priceIndex / 100);
    else if (rt === 'advertising') rev += n * ind.adArpu * Math.pow(MARKET_BY_ID[mid].income, 0.8) * s.macro.priceLevel;
    else {
      const freq = rt === 'transactional' ? ind.purchaseFreq : 1;
      rev += n * referencePrice(s, mid, seg) * c.priceIndex * upc * freq * (ind.defaultMonetization === 'freemium' ? 0.25 : 1);
    }
  }
  return rev;
}

export function competitorCustomers(c: Competitor): number {
  let t = 0;
  for (const k in c.customers) t += c.customers[k];
  return t;
}

const NEXT_STAGE: Record<string, RoundKind | 'public'> = {
  bootstrapped: 'seed', seed: 'series_a', series_a: 'series_b', series_b: 'series_c', series_c: 'growth', growth: 'public', friends_family: 'seed', angel: 'seed',
};

/** Our average price index relative to the reference price in our HQ market. */
function ourPriceIndex(s: SimState): number {
  const launched = s.products.filter((p) => p.stage === 'launched');
  if (!launched.length) return 1;
  const ref = referencePrice(s, s.config.hqMarket, 'consumers', launched[0]);
  const rt = MONETIZATIONS[launched[0].monetization].revenueType;
  if (rt === 'advertising') return 1;
  return launched.reduce((a, p) => a + p.price, 0) / launched.length / Math.max(1e-6, ref);
}

export function monthlyCompetitors(s: SimState, ourRevenue: number, prevOurRevenue: number): void {
  const ind = industryOf(s);
  const diff = difficultyOf(s);
  const aggression = diff.competitorAggression;
  const climate = fundingClimate(s);
  const ourPI = ourPriceIndex(s);
  const ourGrowth = prevOurRevenue > 0 ? ourRevenue / prevOurRevenue - 1 : 0;
  const ourQuality = Math.max(0, ...s.products.filter((p) => p.stage === 'launched').map((p) => p.quality));
  const ourPatents = s.products.filter((p) => p.patent?.status === 'granted').length;
  const priceWarScenario = s.config.scenarioId === 'price_war';

  for (const c of s.competitors) {
    if (c.status !== 'active') continue;
    const sp = STRATEGY_PARAMS[c.strategy];
    const rev = competitorRevenue(s, c);
    const prevRev = c.revenueHistory[c.revenueHistory.length - 1] ?? rev;
    const growth = prevRev > 0 ? rev / prevRev - 1 : 0;
    const payroll = c.headcount * c.avgSalary * s.macro.priceLevel;
    const costs = rev * (1 - c.grossMargin) + payroll + c.marketingSpend;
    c.cash += rev - costs;
    c.revenueHistory.push(rev);
    if (c.revenueHistory.length > 120) c.revenueHistory.shift();

    // Pricing reactions.
    const losingToUs = ourGrowth > 0.05 && growth < 0 && ourRevenue > rev * 0.1;
    if (priceWarScenario && c.strategy === 'aggressive_growth' && s.day > 60 && c.priceWarUntil < s.day) {
      c.priceWarUntil = s.day + 240;
      addNews(s, `${c.name} slashes prices by 25%`, `${c.name} declares war on the market with deep discounts, backed by fresh funding.`, 'competitor', 'negative');
      c.priceIndex *= 0.75;
      c.cash += 300000000;
    }
    if (c.priceWarUntil >= s.day) {
      c.priceIndex = Math.max(0.5, c.priceIndex * 0.995);
    } else if ((c.strategy === 'price_leader' || c.strategy === 'aggressive_growth') && ourPI < c.priceIndex * 0.95 && losingToUs && chance(s, 0.35 * aggression)) {
      const cut = randRange(s, 0.05, 0.12) * aggression;
      c.priceIndex = Math.max(0.5, c.priceIndex * (1 - cut));
      addNews(s, `${c.name} cuts prices ${(cut * 100).toFixed(0)}%`, `A direct response to losing share. Price index now ${c.priceIndex.toFixed(2)}.`, 'competitor', 'negative');
      if (aggression >= 1.25 && chance(s, 0.3)) c.priceWarUntil = s.day + 150;
    } else if (c.strategy === 'fast_follower') {
      c.priceIndex = approach(c.priceIndex, Math.max(0.6, ourPI * 0.95), 0.1);
    } else {
      c.priceIndex = approach(c.priceIndex, sp.price, 0.04);
    }
    // Margins shrink with price cuts.
    c.grossMargin = clamp(ind.competitorMargin - (1 - Math.min(1, c.priceIndex / sp.price)) * 0.6, 0.02, 0.9);

    // Product development and launches.
    const rdFactor = sp.rd * (c.cash > 0 ? 1 : 0.3);
    const followTarget = c.strategy === 'fast_follower' ? Math.max(c.quality, ourQuality - 2 - ourPatents * 3) : c.quality;
    c.quality = clamp(approach(c.quality, followTarget, 0.15) + rdFactor * 0.3 - (ind.obsolescence * 6), 20, 95);
    c.novelty = Math.max(0.4, c.novelty * (1 - ind.obsolescence));
    if (chance(s, sp.launch * (c.cash > 0 ? 1 : 0.3) * (1 + ind.obsolescence * 5))) {
      const jump = randRange(s, 3, 8) * (c.strategy === 'innovator' ? 1.3 : 1);
      c.quality = clamp(c.quality + jump, 20, 97);
      c.novelty = 1.2;
      c.products += 1;
      c.lastLaunchDay = s.day;
      if (c.strategy === 'innovator' && chance(s, 0.4)) c.patents += 1;
      addNews(s, `${c.name} launches a new product`, `Quality jumps by about ${jump.toFixed(0)} points. ${c.strategy === 'innovator' ? 'Analysts call it a category-defining release.' : ''}`, 'competitor', 'negative');
    }

    // Marketing budget and awareness.
    c.marketingSpend = Math.max(0, rev * sp.marketing * (c.cash > costs * 3 ? 1.2 : c.cash > 0 ? 1 : 0.4) * aggression);
    const per = c.marketingSpend / Math.max(1, c.markets.length);
    for (const mid of c.markets) {
      const pop = MARKET_BY_ID[mid].population * 1e6;
      const target = clamp(0.1 + 0.55 * saturate(per / Math.max(1, pop * 0.08), 1) + c.brand / 400, 0.03, 0.9);
      c.awareness[mid] = approach(c.awareness[mid] ?? 0, target, 0.08);
    }
    c.brand = clamp(approach(c.brand, 30 + c.quality * 0.4 + saturate(c.marketingSpend, 20000000) * 20, 0.03), 5, 95);

    // Hiring follows revenue; cut costs when cash is short.
    const targetHead = Math.max(8, (rev * 12) / revenuePerHead(s) * (c.strategy === 'aggressive_growth' ? 1.3 : 1));
    const runway = c.cash / Math.max(1, costs - rev);
    const prevHead = c.headcount;
    if (c.cash < 0 || (costs > rev && runway < 4)) {
      c.headcount = Math.max(5, Math.round(c.headcount * 0.85));
      c.marketingSpend *= 0.5;
      if (prevHead - c.headcount >= 10) addNews(s, `${c.name} lays off ${prevHead - c.headcount} staff`, 'The company is cutting costs to extend its runway.', 'competitor', 'neutral');
    } else {
      c.headcount = Math.round(approach(c.headcount, targetHead, 0.1));
    }
    c.headcountHistory.push(c.headcount);
    if (c.headcountHistory.length > 120) c.headcountHistory.shift();

    // Fundraising.
    if ((runway < 9 || growth > 0.04) && c.cash < costs * 12 && chance(s, 0.12 * climate * diff.financingEase)) {
      const next = NEXT_STAGE[c.fundingStage] ?? 'growth';
      if (next !== 'public') {
        const amount = Math.max(50000000, rev * 12 * randRange(s, 0.6, 1.8));
        c.cash += amount;
        c.totalRaised += amount;
        c.fundingStage = next;
        addNews(s, `${c.name} raises ₹${(amount / 1e7).toFixed(0)} crore in ${next.replace('_', ' ').replace('series', 'Series')}`, `Investors bet on ${c.name}'s ${c.strategy.replace('_', ' ')} strategy. Expect more marketing and hiring.`, 'competitor', 'negative');
      }
    }

    // Expansion.
    if (c.cash > costs * 18 && chance(s, 0.03 * aggression)) {
      const options = MARKETS.filter((m) => !c.markets.includes(m.id));
      if (options.length) {
        const m = pick(s, options);
        c.markets.push(m.id);
        c.awareness[m.id] = 0.05;
        c.cash -= m.entryCost;
        addNews(s, `${c.name} expands into ${m.name}`, 'A new front in the competitive landscape.', 'competitor', 'neutral');
      }
    }

    c.valuation = Math.max(0, rev * 12 * ind.multiple * clamp(1 + growth * 8, 0.4, 2.5));

    // Failure.
    if (c.cash < 0) {
      c.negativeCashMonths += 1;
      if (c.negativeCashMonths >= 3 && !(chance(s, 0.25 * climate))) {
        c.status = 'bankrupt';
        const lost = competitorCustomers(c);
        c.customers = {};
        addNews(s, `${c.name} shuts down`, `The company ran out of money. About ${Math.round(lost).toLocaleString('en-IN')} customers are looking for a new provider.`, 'competitor', 'positive');
      } else if (c.negativeCashMonths >= 3) {
        c.cash += Math.max(20000000, costs * 6);
        c.negativeCashMonths = 0;
        addNews(s, `${c.name} secures a rescue round`, 'A down round keeps the lights on.', 'competitor', 'neutral');
      }
    } else c.negativeCashMonths = 0;
  }

  // Occasional consolidation: a strong competitor absorbs a weak one.
  const active = s.competitors.filter((c) => c.status === 'active');
  if (active.length >= 3 && chance(s, 0.015)) {
    const sorted = [...active].sort((a, b) => b.cash - a.cash);
    const buyer = sorted[0];
    const target = sorted[sorted.length - 1];
    if (buyer.cash > target.valuation * 1.3) {
      buyer.cash -= target.valuation * 1.3;
      for (const k in target.customers) buyer.customers[k] = (buyer.customers[k] ?? 0) + target.customers[k] * 0.85;
      for (const m of target.markets) if (!buyer.markets.includes(m)) { buyer.markets.push(m); buyer.awareness[m] = target.awareness[m] ?? 0.1; }
      target.status = 'acquired';
      target.customers = {};
      addNews(s, `${buyer.name} acquires ${target.name}`, `Deal valued at about ₹${(target.valuation * 1.3 / 1e7).toFixed(0)} crore.`, 'competitor', 'neutral');
    }
  }
}

/** Uncertain estimate of a competitor metric. Analytics tech narrows the error. */
export function intelEstimate(s: SimState, c: Competitor, value: number, salt = 0): { estimate: number; low: number; high: number } {
  const uncertainty = 0.35 * (1 - 0.13 * s.tech.levels.analytics);
  const bias = Math.sin(c.intelNoise * 7.3 + salt * 3.1) * uncertainty * 0.6;
  const estimate = value * (1 + bias);
  return { estimate, low: estimate * (1 - uncertainty), high: estimate * (1 + uncertainty) };
}

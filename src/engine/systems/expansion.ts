// Geographic expansion: entering a market costs money and takes time; once in,
// the market's population, income, competition and regulation apply.
import { INDUSTRIES } from '../data/industries';
import { MARKET_BY_ID, COUNTRIES } from '../data/markets';
import type { SimState } from '../types';
import { segmentsFor } from '../context';
import { msKey } from '../util';
import { payExpense } from './ledger';
import { addNews } from './news';
import { suggestedPriceMult } from './pricing';

export function entryCost(s: SimState, marketId: string): number {
  const m = MARKET_BY_ID[marketId];
  const loc = s.research.unlocked.includes('localization') ? 0.6 : 1;
  const foreign = m.country !== MARKET_BY_ID[s.config.hqMarket].country;
  return m.entryCost * s.macro.priceLevel * (foreign ? loc : 1);
}

export function entryDays(s: SimState, marketId: string): number {
  const m = MARKET_BY_ID[marketId];
  const loc = s.research.unlocked.includes('localization') ? 0.7 : 1;
  return Math.round(m.entryDays * loc);
}

export function enterMarket(s: SimState, marketId: string): { ok: boolean; message: string } {
  const ms = s.markets.find((m) => m.id === marketId);
  const def = MARKET_BY_ID[marketId];
  if (!ms || !def) return { ok: false, message: 'Unknown market.' };
  if (ms.entered || ms.entering) return { ok: false, message: `Already in ${def.name}.` };
  const cost = entryCost(s, marketId);
  if (s.finance.cash < cost) return { ok: false, message: `Entering ${def.name} costs ₹${Math.round(cost).toLocaleString('en-IN')}.` };
  payExpense(s, 'other', cost, 'Market entry');
  ms.entering = true;
  ms.entryCompleteDay = s.day + entryDays(s, marketId);
  ms.priceMult = Math.round(suggestedPriceMult(s, marketId) * 100) / 100;
  const days = entryDays(s, marketId);
  addNews(s, `${s.company.name} announces expansion to ${def.name}`, `Launch expected in about ${days} days. Entry cost ₹${(cost / 1e5).toFixed(1)} lakh.`, 'company', 'positive');
  return { ok: true, message: `Entering ${def.name}: ready in ${days} days. Local price set to ${ms.priceMult}× (purchasing-power adjusted).` };
}

export function exitMarket(s: SimState, marketId: string): { ok: boolean; message: string } {
  const ms = s.markets.find((m) => m.id === marketId);
  if (!ms || !ms.entered) return { ok: false, message: 'Not in this market.' };
  if (marketId === s.config.hqMarket) return { ok: false, message: 'You cannot exit your home market.' };
  let lost = 0;
  for (const k in s.cells) {
    if (s.cells[k].marketId === marketId) {
      lost += s.cells[k].customers;
      delete s.cells[k];
    }
  }
  s.month.churned += lost;
  for (const k of Object.keys(s.sales.pipeline)) if (s.sales.pipeline[k].marketId === marketId) delete s.sales.pipeline[k];
  ms.entered = false;
  ms.enteredDay = null;
  addNews(s, `${s.company.name} pulls out of ${MARKET_BY_ID[marketId].name}`, `${Math.round(lost).toLocaleString('en-IN')} customers there are no longer served.`, 'company', 'negative');
  return { ok: true, message: `Exited ${MARKET_BY_ID[marketId].name}.` };
}

export function dailyExpansion(s: SimState): void {
  for (const ms of s.markets) {
    if (!ms.entering || ms.entryCompleteDay === null || s.day < ms.entryCompleteDay) continue;
    ms.entering = false;
    ms.entered = true;
    ms.enteredDay = s.day;
    for (const seg of segmentsFor(s)) {
      const k = msKey(ms.id, seg);
      s.company.awareness[k] = Math.max(s.company.awareness[k] ?? 0, 0.003 + s.company.brand / 20000);
    }
    const def = MARKET_BY_ID[ms.id];
    addNews(s, `${s.company.name} is now live in ${def.name}`, `${def.population.toLocaleString('en-IN')}M people, ${COUNTRIES[def.country].currency} market.`, 'company', 'positive');
  }
}

/** Monthly market growth: local economic growth plus the industry's category growth. */
export function monthlyMarkets(s: SimState): void {
  const industryGrowth = INDUSTRIES[s.config.industry].growth;
  const cycle = s.macro.phase === 'boom' ? 0.02 : s.macro.phase === 'recession' ? -0.03 : 0;
  for (const ms of s.markets) {
    const def = MARKET_BY_ID[ms.id];
    ms.sizeMult *= 1 + (def.growth * 0.5 + industryGrowth + cycle) / 12;
  }
}

// Decision resolution and monthly opportunity generation. Every option maps to
// concrete engine changes; unanswered decisions resolve to their default.
import { MARKETS, MARKET_BY_ID } from '../data/markets';
import type { Decision, SimState } from '../types';
import { launchedProducts, physical } from '../context';
import { chance, pick } from '../rng';
import { clamp, uid } from '../util';
import { payExpense } from './ledger';
import { addNews } from './news';
import { createDecision, hasOpenDecision } from './decisionCore';
import { launchProduct } from './products';
import { signContract } from './contracts';
import { signPartnership } from './growth';
import { promote } from './employees';
import { acquireCompetitor, acquisitionQuote, maybeAcquisitionOffer, sellCompany } from './ma';
import { loanOffers, takeLoan } from './loans';
import { enterMarket, entryCost } from './expansion';
import { maybeOfferContract } from './contracts';
import { maybeOfferPartnership } from './growth';

export function resolveDecision(s: SimState, id: string, optionId: string): string {
  const d = s.decisions.find((x) => x.id === id);
  if (!d || d.resolved) return 'Decision no longer open.';
  if (!d.options.some((o) => o.id === optionId)) return 'Unknown option.';
  const outcome = apply(s, d, optionId);
  d.resolved = true;
  d.chosen = optionId;
  d.outcome = outcome;
  return outcome;
}

function apply(s: SimState, d: Decision, opt: string): string {
  const data = d.data;
  switch (d.kind) {
    case 'launch_strategy': {
      const p = s.products.find((x) => x.id === data.productId);
      if (!p) return 'Product no longer exists.';
      return `Launched ${p.name}. ${launchProduct(s, p, opt).join('. ')}`;
    }
    case 'enterprise_contract': {
      if (opt === 'decline') return 'Deal declined.';
      if (opt === 'negotiate') {
        if (chance(s, 0.55)) { const c = signContract(s, data, 1.15); return `They accepted +15%. Signed ${c.client} at ₹${c.annualValue.toLocaleString('en-IN')}/year.`; }
        addNews(s, `${String(data.client)} picks a competitor`, 'Negotiations broke down over price.', 'company', 'negative');
        return 'They walked away and chose a competitor.';
      }
      const c = signContract(s, data);
      return `Signed ${c.client} at ₹${c.annualValue.toLocaleString('en-IN')}/year.`;
    }
    case 'partnership':
      if (opt === 'accept') { const p = signPartnership(s, data); return `Partnership with ${p.partner} is live.`; }
      return 'Partnership declined.';
    case 'legal_case': {
      const lc = s.legalCases.find((x) => x.id === data.caseId);
      if (!lc) return 'Case closed.';
      if (opt === 'settle') {
        const amt = lc.exposure * 0.55;
        payExpense(s, 'legal', amt, 'Legal settlement');
        lc.status = 'settled';
        return `Settled for ₹${Math.round(amt).toLocaleString('en-IN')}.`;
      }
      lc.fighting = true;
      return `Fighting the case. Legal fees ≈ ₹${lc.monthlyCost.toLocaleString('en-IN')}/month until resolved.`;
    }
    case 'viral_moment': {
      if (opt !== 'boost') return 'Let it play out organically.';
      const b = Number(data.budget);
      payExpense(s, 'marketing', b, 'Viral burst campaign');
      s.month.marketingSpend.social = (s.month.marketingSpend.social ?? 0) + b * 0.6;
      s.month.marketingSpend.influencer = (s.month.marketingSpend.influencer ?? 0) + b * 0.4;
      for (const k in s.company.awareness) s.company.awareness[k] = clamp(s.company.awareness[k] * 1.25 + 0.005, 0, 0.98);
      s.modifiers.push({ id: uid(s, 'm'), target: 'conversion', value: 1.1, scope: null, startDay: s.day, endDay: s.day + 30, source: 'Viral burst campaign' });
      return `Spent ₹${b.toLocaleString('en-IN')}: awareness ×1.25, conversion +10% for 30 days.`;
    }
    case 'celebrity': {
      if (opt !== 'sign') return 'Declined the endorsement.';
      const fee = Number(data.fee);
      payExpense(s, 'marketing', fee, 'Celebrity endorsement');
      s.month.marketingSpend.influencer = (s.month.marketingSpend.influencer ?? 0) + fee;
      s.company.brand = clamp(s.company.brand + 6, 0, 100);
      s.modifiers.push({ id: uid(s, 'm'), target: 'conversion', value: 1.15, scope: null, startDay: s.day, endDay: s.day + 120, source: 'Celebrity endorsement' });
      if (chance(s, 0.1)) {
        s.company.brand = clamp(s.company.brand - 8, 0, 100);
        addNews(s, 'Endorser caught in scandal', `${s.company.name}'s celebrity partner is in the headlines for the wrong reasons.`, 'company', 'negative');
        return 'Signed — but the celebrity was caught in a scandal. Brand net −2.';
      }
      return 'Signed. Brand +6 and conversion +15% for 4 months.';
    }
    case 'key_employee': {
      const e = s.employees.find((x) => x.id === data.employeeId);
      if (!e) return 'They already left.';
      if (opt === 'counter') {
        e.salary = Math.round(e.salary * 1.3);
        e.morale = clamp(e.morale + 12, 0, 100);
        e.loyalty = clamp(e.loyalty + 15, 0, 100);
        for (const o of s.employees) if (o.id !== e.id && o.dept === e.dept) o.morale = clamp(o.morale - 1, 0, 100);
        return `${e.name} stays at ₹${e.salary.toLocaleString('en-IN')}/month.`;
      }
      if (opt === 'promote') return promote(s, e.id);
      s.employees = s.employees.filter((x) => x.id !== e.id);
      s.month.quits += 1;
      return `${e.name} left for a competitor.`;
    }
    case 'acquisition_target': {
      if (opt !== 'acquire') return 'Passed on the acquisition.';
      const r = acquireCompetitor(s, String(data.competitorId), Number(data.price), 'cash');
      return r.message;
    }
    case 'acquisition_offer': {
      if (opt === 'accept') {
        sellCompany(s, String(data.acquirer), Number(data.price), 'acquired');
        return `Company sold to ${String(data.acquirer)}.`;
      }
      if (opt === 'counter') {
        if (chance(s, 0.4)) { sellCompany(s, String(data.acquirer), Number(data.price) * 1.2, 'acquired'); return 'They accepted your counter at +20%. Company sold.'; }
        return `${String(data.acquirer)} walked away.`;
      }
      return 'You declined the offer and remain independent.';
    }
    case 'credit_line': {
      if (opt !== 'accept') return 'Declined the credit line.';
      const offer = loanOffers(s).find((o) => o.kind === 'revolver');
      if (!offer?.available) return 'The bank withdrew the offer.';
      return takeLoan(s, 'revolver', Math.min(offer.maxAmount, Number(data.amount))).message;
    }
    case 'supplier_discount': {
      const sup = s.suppliers.find((x) => x.id === data.supplierId);
      if (!sup || opt !== 'accept') return 'Declined.';
      sup.costMult *= 0.88;
      sup.minOrder = Math.round(sup.minOrder * 2);
      sup.contracted = true;
      sup.relationship = clamp(sup.relationship + 10, 0, 100);
      return `${sup.name} prices −12% in exchange for doubled minimum orders.`;
    }
    case 'market_opportunity': {
      if (opt !== 'enter') return 'Not expanding right now.';
      return enterMarket(s, String(data.marketId)).message;
    }
    case 'price_war': {
      if (opt === 'match') {
        for (const p of launchedProducts(s)) { p.priceChangedDay = s.day; p.price = Math.round(p.price * 0.85 * 100) / 100; }
        return 'Prices cut 15% across products.';
      }
      if (opt === 'differentiate') {
        s.marketing.budgets.content += 100000;
        s.marketing.budgets.social += 100000;
        s.company.brand = clamp(s.company.brand + 1, 0, 100);
        return 'Holding price and investing ₹2L/month more in brand marketing.';
      }
      return 'Holding prices steady.';
    }
    default:
      return 'Noted.';
  }
}

/** Apply defaults to decisions that expired without an answer. */
export function expireDecisions(s: SimState): void {
  for (const d of s.decisions) {
    if (d.resolved || d.expiresDay > s.day) continue;
    const out = resolveDecision(s, d.id, d.defaultOption);
    d.outcome = `No response in time — defaulted to "${d.options.find((o) => o.id === d.defaultOption)?.label}". ${out}`;
  }
  if (s.decisions.length > 120) s.decisions = s.decisions.filter((d, i) => !d.resolved || i < 80);
}

export function generateOpportunities(s: SimState): void {
  if (s.status !== 'running') return;
  maybeOfferContract(s);
  maybeOfferPartnership(s);

  // A struggling competitor may be for sale.
  const weak = s.competitors.filter((c) => c.status === 'active' && (c.cash < 0 || c.negativeCashMonths > 0));
  if (weak.length && !hasOpenDecision(s, 'acquisition_target') && chance(s, 0.35)) {
    const c = pick(s, weak);
    const q = acquisitionQuote(s, c);
    createDecision(s, {
      kind: 'acquisition_target', category: 'opportunity', title: `${c.name} is struggling and open to a sale`,
      description: `Estimated revenue ₹${(q.revenue / 1e5).toFixed(1)} lakh/month, ~${Math.round(q.customers).toLocaleString('en-IN')} customers, ${q.headcount} staff. Asking about ₹${(q.askingPrice / 1e7).toFixed(2)} Cr. Integration would cost ~₹${(q.integrationCost / 1e7).toFixed(2)} Cr over 4 months.`,
      days: 30,
      options: [
        { id: 'acquire', label: `Offer ₹${(q.askingPrice / 1e7).toFixed(2)} Cr cash`, description: 'Buy them at their asking price.', consequences: ['+customers, +team, +markets', `−₹${(q.askingPrice / 1e7).toFixed(2)} Cr cash`, 'Goodwill on the balance sheet', 'Temporary productivity dip'] },
        { id: 'pass', label: 'Pass', description: 'Let them fail — their customers will look for new vendors.', consequences: ['Some of their customers may come to you anyway'] },
      ],
      defaultOption: 'pass', data: { competitorId: c.id, price: q.askingPrice },
    });
  }

  const offer = maybeAcquisitionOffer(s);
  if (offer && !hasOpenDecision(s, 'acquisition_offer')) {
    createDecision(s, {
      kind: 'acquisition_offer', category: 'opportunity', title: `${offer.acquirer} offers to buy ${s.company.name}`,
      description: `An all-cash offer of ₹${(offer.price / 1e7).toFixed(1)} Cr. Accepting ends the game with an exit — proceeds follow the cap table and investor preferences.`,
      days: 21,
      options: [
        { id: 'accept', label: 'Accept and sell', description: 'Take the exit.', consequences: ['Game ends with an acquisition exit'] },
        { id: 'counter', label: 'Counter at +20%', description: 'Push for more.', consequences: ['~40% chance they agree', 'Otherwise they walk'] },
        { id: 'decline', label: 'Stay independent', description: 'Keep building.', consequences: ['No change'] },
      ],
      defaultOption: 'decline', data: { acquirer: offer.acquirer, price: offer.price },
    });
  }

  if (s.reports.length >= 6 && !hasOpenDecision(s, 'credit_line') && !s.loans.some((l) => l.kind === 'revolver' && l.status === 'active') && chance(s, 0.05)) {
    const o = loanOffers(s).find((x) => x.kind === 'revolver');
    if (o?.available && o.maxAmount > 500000) {
      createDecision(s, {
        kind: 'credit_line', category: 'opportunity', title: `${o.lender} offers a revolving credit line`,
        description: `Up to ₹${(o.maxAmount / 1e5).toFixed(1)} lakh at ${o.rate.toFixed(1)}%. Drawing it now gives you a cash buffer; you pay interest only on what you draw.`,
        days: 20,
        options: [
          { id: 'accept', label: 'Draw the full line', description: 'Take the cash buffer now.', consequences: [`+₹${(o.maxAmount / 1e5).toFixed(1)}L cash`, `${o.rate.toFixed(1)}% interest`] },
          { id: 'decline', label: 'No thanks', description: '', consequences: [] },
        ],
        defaultOption: 'decline', data: { amount: o.maxAmount },
      });
    }
  }

  if (physical(s) && !hasOpenDecision(s, 'supplier_discount') && chance(s, 0.05)) {
    const sup = pick(s, s.suppliers.filter((x) => x.status === 'active'));
    if (sup) createDecision(s, {
      kind: 'supplier_discount', category: 'opportunity', title: `${sup.name} offers a volume discount`,
      description: 'A 12% price cut in exchange for doubling your minimum order size — cheaper stock, but more cash tied up in inventory.',
      days: 20,
      options: [
        { id: 'accept', label: 'Accept', description: '', consequences: ['Unit cost −12%', 'Minimum order ×2'] },
        { id: 'decline', label: 'Decline', description: '', consequences: [] },
      ],
      defaultOption: 'decline', data: { supplierId: sup.id },
    });
  }

  if (!hasOpenDecision(s, 'market_opportunity') && launchedProducts(s).length && chance(s, 0.04)) {
    const options = MARKETS.filter((m) => !s.markets.find((x) => x.id === m.id)?.entered && !s.markets.find((x) => x.id === m.id)?.entering);
    if (options.length) {
      const m = options.reduce((a, b) => (b.growth * (1 - b.competition) > a.growth * (1 - a.competition) ? b : a));
      const cost = entryCost(s, m.id);
      createDecision(s, {
        kind: 'market_opportunity', category: 'opportunity', title: `${m.name} is growing fast`,
        description: `Demand in ${m.name} is growing ~${(m.growth * 100).toFixed(0)}% a year with ${m.competition < 0.65 ? 'moderate' : 'heavy'} competition. Population ${m.population}M, income index ${m.income}. Entry costs ₹${(cost / 1e5).toFixed(1)} lakh.`,
        days: 30,
        options: [
          { id: 'enter', label: `Enter ${m.name}`, description: 'Start market entry now.', consequences: [`−₹${(cost / 1e5).toFixed(1)}L`, `Live in ~${m.entryDays} days`] },
          { id: 'wait', label: 'Not now', description: '', consequences: [] },
        ],
        defaultOption: 'wait', data: { marketId: m.id },
      });
    }
  }

  const warring = s.competitors.find((c) => c.status === 'active' && c.priceWarUntil >= s.day);
  if (warring && launchedProducts(s).length && !hasOpenDecision(s, 'price_war') && !s.flags[`pw|${warring.id}|${warring.priceWarUntil}`]) {
    s.flags[`pw|${warring.id}|${warring.priceWarUntil}`] = true;
    createDecision(s, {
      kind: 'price_war', category: 'crisis', title: `${warring.name} has started a price war`,
      description: `Their prices are now ${(warring.priceIndex * 100).toFixed(0)}% of the market reference. Price-sensitive customers are defecting.`,
      days: 14,
      options: [
        { id: 'match', label: 'Cut prices 15%', description: 'Defend share at the cost of margin.', consequences: ['Price −15%', 'Lower gross margin'] },
        { id: 'differentiate', label: 'Hold price, invest in brand', description: 'Compete on value, not price.', consequences: ['+₹2L/month content & social', 'Brand +1'] },
        { id: 'hold', label: 'Do nothing', description: '', consequences: ['Lose some price-sensitive customers'] },
      ],
      defaultOption: 'hold', data: { competitorId: warring.id },
    });
  }
}

export const marketName = (id: string) => MARKET_BY_ID[id]?.name ?? id;

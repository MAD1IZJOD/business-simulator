// Partnerships and A/B experiments.
import { PARTNER_NAMES } from '../data/names';
import type { Experiment, Partnership, PartnershipKind, SimState } from '../types';
import { industryOf, launchedProducts } from '../context';
import { chance, pick, randNormal, randRange } from '../rng';
import { clamp, uid } from '../util';
import { payExpense, sell } from './ledger';
import { addNews } from './news';
import { createDecision, hasOpenDecision } from './decisionCore';

const KIND_TEXT: Record<PartnershipKind, { title: string; effect: string }> = {
  distribution: { title: 'distribution partnership', effect: 'Puts your product in front of their customers; they take a revenue share on sales they drive.' },
  technology: { title: 'technology partnership', effect: 'Integrates their technology: conversion improves.' },
  customers: { title: 'customer referral partnership', effect: 'They refer their customers to you, raising awareness.' },
  credibility: { title: 'co-branding partnership', effect: 'Their reputation rubs off: brand and enterprise trust improve.' },
  infrastructure: { title: 'infrastructure partnership', effect: 'Discounted, more reliable infrastructure: fewer outages.' },
  licensing: { title: 'licensing deal', effect: 'They license your technology and pay you royalties every month.' },
};

export function maybeOfferPartnership(s: SimState): void {
  if (!launchedProducts(s).length || hasOpenDecision(s, 'partnership')) return;
  const active = s.partnerships.filter((p) => p.status === 'active').length;
  if (!chance(s, 0.07 * (0.5 + s.company.brand / 60) / (1 + active * 0.5))) return;
  const kinds: PartnershipKind[] = ['distribution', 'technology', 'customers', 'credibility', 'infrastructure'];
  if (s.products.some((p) => p.patent?.status === 'granted') || s.research.unlocked.includes('novel_ip')) kinds.push('licensing', 'licensing');
  const kind = pick(s, kinds);
  const partner = pick(s, PARTNER_NAMES);
  const months = pick(s, [12, 18, 24]);
  const fee = kind === 'licensing' ? 0 : Math.round(randRange(s, 2, 12) * 100000);
  const share = kind === 'distribution' ? pick(s, [0.1, 0.15, 0.2]) : kind === 'licensing' ? pick(s, [0.04, 0.06]) : 0;
  const strength = randRange(s, 0.4, 1);
  const royalty = kind === 'licensing' ? Math.round(industryOf(s).basePrice * 250 * strength) : 0;
  createDecision(s, {
    kind: 'partnership',
    category: 'opportunity',
    title: `${partner} proposes a ${KIND_TEXT[kind].title}`,
    description: `${KIND_TEXT[kind].effect} Term: ${months} months.${fee ? ` Upfront fee ₹${(fee / 1e5).toFixed(1)} lakh.` : ''}${share && kind === 'distribution' ? ` Revenue share ${(share * 100).toFixed(0)}% on partner-driven sales.` : ''}${royalty ? ` Expected royalties ≈ ₹${(royalty / 1e5).toFixed(1)} lakh/month.` : ''}`,
    days: 25,
    options: [
      { id: 'accept', label: 'Sign the partnership', description: 'Accept the terms.', consequences: [KIND_TEXT[kind].effect, fee ? `−₹${(fee / 1e5).toFixed(1)}L upfront` : 'No upfront fee'] },
      { id: 'decline', label: 'Decline', description: 'Not now.', consequences: ['Nothing changes'] },
    ],
    defaultOption: 'decline',
    data: { kind, partner, months, fee, share, strength, royalty },
  });
}

export function signPartnership(s: SimState, d: Record<string, unknown>): Partnership {
  const kind = d.kind as PartnershipKind;
  const p: Partnership = {
    id: uid(s, 'pt'),
    partner: String(d.partner),
    kind,
    startDay: s.day,
    endDay: s.day + Math.round(Number(d.months) * 30.4),
    upfrontFee: Number(d.fee),
    revenueShare: Number(d.share),
    strength: Number(d.strength),
    marketId: null,
    status: 'active',
    attributedRevenue: 0,
  };
  if (p.upfrontFee > 0) payExpense(s, 'fees', p.upfrontFee, 'Partnership fees');
  s.partnerships.push(p);
  const mod = (target: 'conversion' | 'outage', value: number) => s.modifiers.push({ id: uid(s, 'm'), target, value, scope: null, startDay: s.day, endDay: p.endDay, source: `${p.partner} partnership` });
  if (kind === 'technology') mod('conversion', 1 + 0.08 * p.strength);
  if (kind === 'infrastructure') mod('outage', 1 - 0.3 * p.strength);
  if (kind === 'credibility') s.company.brand = clamp(s.company.brand + 4 * p.strength, 0, 100);
  if (kind === 'licensing') s.flags[`royalty|${p.id}`] = Number(d.royalty);
  addNews(s, `${s.company.name} partners with ${p.partner}`, KIND_TEXT[kind].effect, 'company', 'positive');
  return p;
}

export function monthlyPartnerships(s: SimState): void {
  for (const p of s.partnerships) {
    if (p.status !== 'active') continue;
    if (s.day >= p.endDay) {
      p.status = 'ended';
      continue;
    }
    if (p.kind === 'licensing') {
      const royalty = Number(s.flags[`royalty|${p.id}`] ?? 0) * (0.8 + s.company.brand / 250);
      if (royalty > 0) {
        sell(s, royalty, { stream: 'Licensing royalties' }, 30);
        p.attributedRevenue += royalty;
      }
    }
  }
}

// ------------------------------------------------------------------ experiments

export const EXPERIMENT_INFO: Record<Experiment['kind'], { name: string; stage: string; cost: number }> = {
  landing_page: { name: 'Landing page test', stage: 'Website visit → consideration', cost: 150000 },
  messaging: { name: 'Marketing message test', stage: 'Awareness → interest', cost: 120000 },
  feature: { name: 'Feature test', stage: 'Trial → purchase', cost: 300000 },
  pricing: { name: 'Pricing test (±10%)', stage: 'Measures price elasticity', cost: 100000 },
};

export function startExperiment(s: SimState, kind: Experiment['kind'], productId: string | null): { ok: boolean; message: string } {
  if (s.experiments.some((e) => e.status === 'running' && e.kind === kind)) return { ok: false, message: 'A test of this kind is already running.' };
  const info = EXPERIMENT_INFO[kind];
  payExpense(s, 'marketing', info.cost, 'A/B testing');
  const true_ = kind === 'pricing' ? 0 : randNormal(s, 0.03, 0.06);
  s.experiments.unshift({ id: uid(s, 'x'), kind, productId, startDay: s.day, endDay: s.day + 30, cost: info.cost, trueEffect: true_, status: 'running', sample: 0, estimate: 0, stdError: 0 });
  return { ok: true, message: `${info.name} running for 30 days.` };
}

/** Called when an experiment finishes: estimate the effect with sampling error from real traffic. */
export function finishExperiments(s: SimState, visitsLastMonth: number, elasticity: number): void {
  for (const x of s.experiments) {
    if (x.status !== 'running' || s.day < x.endDay) continue;
    const sample = Math.max(20, visitsLastMonth);
    const se = (0.5 / Math.sqrt(sample)) * (1 - 0.1 * s.tech.levels.analytics);
    x.sample = sample;
    x.stdError = se;
    if (x.kind === 'pricing') {
      x.elasticity = elasticity + randNormal(s, 0, se * 4);
      x.estimate = x.elasticity;
    } else {
      x.estimate = x.trueEffect + randNormal(s, 0, se);
    }
    x.status = 'complete';
  }
}

export function shipExperiment(s: SimState, id: string): string {
  const x = s.experiments.find((e) => e.id === id);
  if (!x || x.status !== 'complete') return 'Nothing to ship.';
  x.status = 'shipped';
  if (x.kind === 'pricing') return 'Pricing tests inform decisions; nothing to ship.';
  const fm = s.marketing.funnelMods;
  // The true effect applies — a misleading estimate can ship a loser.
  const f = 1 + x.trueEffect;
  if (x.kind === 'landing_page') fm.consideration = clamp(fm.consideration * f, 0.5, 2);
  if (x.kind === 'messaging') fm.interest = clamp(fm.interest * f, 0.5, 2);
  if (x.kind === 'feature') fm.purchase = clamp(fm.purchase * f, 0.5, 2);
  return `Shipped. Measured effect ${(x.estimate * 100).toFixed(1)}% ± ${(x.stdError * 196).toFixed(1)}%.`;
}

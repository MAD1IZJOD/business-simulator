// Random-event engine: each day, every eligible event rolls against its
// state-scaled probability. Effects change real state and every fired event is
// recorded (with its concrete consequences) in the event log and news feed.
import { EVENTS } from '../data/events';
import type { EventDef, EventEffect } from '../data/events';
import type { EventRecord, LegalCase, SimState } from '../types';
import { difficultyOf, dim, industryOf, launchedProducts, physical, roleCapacity, totalCustomers } from '../context';
import { chance, pick, randInt, randRange } from '../rng';
import { clamp, uid } from '../util';
import { payExpense, recordOpex } from './ledger';
import { addNews } from './news';
import { createDecision } from './decisionCore';
import { startRecession } from './macro';
import { takeFinished } from './inventory';
import { TECH_IDS } from '../data/technology';

function lastRevenue(s: SimState): number {
  const r = s.reports[s.reports.length - 1];
  return r ? r.income.netRevenue : 0;
}

function eligible(s: SimState, e: EventDef): boolean {
  const q = e.requires;
  const ind = industryOf(s);
  if (q.physical && !physical(s)) return false;
  if (q.digital && ind.fulfillment !== 'digital') return false;
  if (q.launched && !launchedProducts(s).length) return false;
  if (q.suppliers && !s.suppliers.some((x) => x.status === 'active')) return false;
  if (q.competitors && !s.competitors.some((c) => c.status === 'active')) return false;
  if (q.minCustomers && totalCustomers(s) < q.minCustomers) return false;
  if (q.minEmployees && s.employees.length < q.minEmployees) return false;
  if (q.industries && !q.industries.includes(ind.id)) return false;
  if (q.notIndustries && q.notIndustries.includes(ind.id)) return false;
  if (q.phase && !q.phase.includes(s.macro.phase)) return false;
  const last = Number(s.flags[`ev|${e.id}`] ?? -99999);
  if (s.day - last < e.cooldownDays) return false;
  return true;
}

function scaleFor(s: SimState, e: EventDef): number {
  const products = launchedProducts(s);
  const q = products.length ? products.reduce((a, p) => a + p.quality, 0) / products.length : 50;
  const sat = products.length ? products.reduce((a, p) => a + p.satisfaction, 0) / products.length : 50;
  switch (e.scale) {
    case 'vulnerability': return s.security.vulnerability / 40;
    case 'size': return clamp(Math.log10(10 + lastRevenue(s)) / 6, 0.3, 2);
    case 'low_quality': return clamp((75 - q) / 25, 0.2, 2.5);
    case 'high_quality': return clamp((q - 35) / 30, 0.1, 2.5);
    case 'low_satisfaction': return clamp((70 - sat) / 25, 0.2, 2.5);
    case 'high_satisfaction': return clamp((sat - 35) / 30, 0.1, 2.5);
    case 'low_morale': {
      const m = s.employees.length ? s.employees.reduce((a, x) => a + x.morale, 0) / s.employees.length : 60;
      return clamp((80 - m) / 30, 0.2, 2.5);
    }
    case 'regulation': return 0.4 + industryOf(s).regulation * 1.5;
    case 'suppliers_risk': {
      const act = s.suppliers.filter((x) => x.status === 'active');
      return act.length ? act.reduce((a, x) => a + x.risk, 0) / act.length / 0.15 : 0;
    }
    case 'brand': return clamp(s.company.brand / 45, 0.2, 2);
    case 'layoffs': return 1 + s.company.layoffShock * 4 + (s.company.lastLayoffDay !== null && s.day - s.company.lastLayoffDay < 180 ? 1.5 : 0);
    default: return 1;
  }
}

/** Daily roll for all events. */
export function dailyEvents(s: SimState): void {
  const diff = difficultyOf(s);
  const days = dim(s);
  const freq = s.config.difficulty === 'sandbox' ? s.config.sandbox.eventFrequency : 1;
  const tutorialCalm = s.config.tutorial && s.day < 90;
  for (const e of EVENTS) {
    if (e.sentiment === 'negative' && tutorialCalm) continue;
    if (!eligible(s, e)) continue;
    const mult = e.sentiment === 'negative' ? diff.negativeEventMult : 1;
    const p = (e.monthlyProbability * scaleFor(s, e) * mult * freq) / days;
    if (chance(s, p)) fireEvent(s, e);
  }
}

function fill(s: SimState, text: string, ctx: Record<string, string>): string {
  return text
    .replace('{company}', s.company.name)
    .replace('{industry}', industryOf(s).name)
    .replace('{product}', ctx.product ?? 'your product')
    .replace('{supplier}', ctx.supplier ?? 'A supplier')
    .replace('{competitor}', ctx.competitor ?? 'A competitor');
}

export function fireEvent(s: SimState, e: EventDef): EventRecord {
  s.flags[`ev|${e.id}`] = s.day;
  const ctx: Record<string, string> = {};
  const products = launchedProducts(s);
  if (products.length) ctx.product = pick(s, products).name;
  const effects: string[] = [];
  let decisionId: string | null = null;
  const severity = difficultyOf(s).eventSeverity;
  for (const eff of e.effects) {
    const out = applyEffect(s, eff, ctx, severity, e);
    if (out.text) effects.push(out.text);
    if (out.decisionId) decisionId = out.decisionId;
  }
  const rec: EventRecord = {
    id: uid(s, 'ev'),
    defId: e.id,
    day: s.day,
    title: fill(s, e.title, ctx),
    description: fill(s, e.description, ctx),
    category: e.category,
    sentiment: e.sentiment,
    effects,
    decisionId,
  };
  s.events.unshift(rec);
  if (s.events.length > 200) s.events.length = 200;
  addNews(s, rec.title, `${rec.description} ${effects.join('. ')}`.trim(), 'event', e.sentiment);
  return rec;
}

function addModifier(s: SimState, target: EventEffect & { type: 'modifier' }, label: string, scope: string | null, severity: number): string {
  const v = target.value < 1 ? 1 - (1 - target.value) * severity : 1 + (target.value - 1) * (target.value > 1 && ['demand', 'conversion', 'funding'].includes(target.target) ? 1 : severity);
  s.modifiers.push({ id: uid(s, 'm'), target: target.target, value: v, scope, startDay: s.day, endDay: s.day + target.days, source: label });
  const pct = (v - 1) * 100;
  return `${target.target.replace('_', ' ')} ${pct >= 0 ? '+' : ''}${pct.toFixed(0)}% for ${target.days} days`;
}

function applyEffect(s: SimState, eff: EventEffect, ctx: Record<string, string>, severity: number, e: EventDef): { text?: string; decisionId?: string } {
  switch (eff.type) {
    case 'modifier':
      return { text: addModifier(s, eff, eff.label ?? e.title, null, severity) };
    case 'cash': {
      const amt = Math.round((eff.fixed ?? 0) + lastRevenue(s) * (eff.revenueMonths ?? 0)) * severity;
      payExpense(s, 'other', amt, eff.label);
      return { text: `Cost ₹${Math.round(amt).toLocaleString('en-IN')}` };
    }
    case 'brand': {
      const d = eff.delta < 0 ? eff.delta * severity : eff.delta;
      s.company.brand = clamp(s.company.brand + d, 0, 100);
      return { text: `Brand ${d >= 0 ? '+' : ''}${d.toFixed(1)}` };
    }
    case 'reputation': {
      const d = eff.delta < 0 ? eff.delta * severity : eff.delta;
      s.company.reputation[eff.key] = clamp(s.company.reputation[eff.key] + d, 0, 100);
      return { text: `${eff.key} reputation ${d >= 0 ? '+' : ''}${d.toFixed(0)}` };
    }
    case 'awareness': {
      for (const k in s.company.awareness) s.company.awareness[k] = clamp(s.company.awareness[k] * eff.mult + 0.01, 0, 0.98);
      return { text: `Awareness ×${eff.mult.toFixed(1)}` };
    }
    case 'supplier_bankrupt': {
      const act = s.suppliers.filter((x) => x.status === 'active');
      if (!act.length) return {};
      const sup = act.reduce((a, b) => (b.risk * randRange(s, 0.5, 1.5) > a.risk ? b : a));
      sup.status = 'bankrupt';
      ctx.supplier = sup.name;
      let lost = 0;
      for (const o of s.orders) if (o.status === 'open' && o.supplierId === sup.id) { o.status = 'cancelled'; lost += o.qty; }
      for (const id in s.inventory) delete s.inventory[id].supplierSplit[sup.id];
      return { text: `${sup.name} is gone; ${lost.toLocaleString('en-IN')} units on order were lost` };
    }
    case 'supplier_disrupt': {
      const act = s.suppliers.filter((x) => x.status === 'active');
      if (!act.length) return {};
      const sup = pick(s, act);
      sup.status = 'disrupted';
      sup.disruptedUntil = s.day + eff.days;
      ctx.supplier = sup.name;
      return { text: `${sup.name} disrupted for ${eff.days} days` };
    }
    case 'competitor_fail': {
      const act = s.competitors.filter((c) => c.status === 'active');
      if (!act.length) return {};
      const c = act.reduce((a, b) => (b.cash < a.cash ? b : a));
      ctx.competitor = c.name;
      c.cash -= Math.abs(c.cash) + (c.revenueHistory[c.revenueHistory.length - 1] ?? 0) * 3;
      c.brand = clamp(c.brand - 10, 0, 100);
      for (const k in c.customers) c.customers[k] *= 0.9;
      return { text: `${c.name}'s cash is wiped out; its brand drops 10 and 10% of its customers leave` };
    }
    case 'competitor_boost': {
      const act = s.competitors.filter((c) => c.status === 'active');
      if (!act.length) return {};
      const c = pick(s, act);
      ctx.competitor = c.name;
      c.quality = clamp(c.quality + 8 * severity, 0, 99);
      c.novelty = 1.3;
      c.lastLaunchDay = s.day;
      return { text: `${c.name} quality +${(8 * severity).toFixed(0)}` };
    }
    case 'lose_customers': {
      let lost = 0;
      for (const k in s.cells) { const x = s.cells[k].customers * eff.pct * severity; s.cells[k].customers -= x; lost += x; }
      s.month.churned += lost;
      return { text: `${Math.round(lost).toLocaleString('en-IN')} customers lost` };
    }
    case 'recession':
      startRecession(s, eff.kind, eff.severity * severity);
      return { text: 'Recession begins' };
    case 'boom':
      s.macro.phase = 'boom';
      s.macro.phaseMonths = 0;
      return { text: 'Boom begins' };
    case 'satisfaction': {
      for (const p of launchedProducts(s)) p.satisfaction = clamp(p.satisfaction + eff.delta * severity, 0, 100);
      return { text: `Satisfaction ${eff.delta * severity >= 0 ? '+' : ''}${(eff.delta * severity).toFixed(0)}` };
    }
    case 'morale': {
      for (const x of s.employees) x.morale = clamp(x.morale + eff.delta, 0, 100);
      return { text: `Morale ${eff.delta >= 0 ? '+' : ''}${eff.delta}` };
    }
    case 'security_incident':
      return securityIncident(s, severity);
    case 'legal_case': {
      const exposure = Math.max(1000000, lastRevenue(s) * eff.exposureMonths) * severity;
      return openLegalCase(s, eff.kind, e.title.replace('{company}', s.company.name), exposure);
    }
    case 'decision':
      return eventDecision(s, eff.kind, ctx);
    case 'fx_shock': {
      const dir = chance(s, 0.5) ? 1 : -1;
      for (const cur in s.macro.fx) if (cur !== 'INR') s.macro.fx[cur] *= 1 + dir * eff.pct;
      return { text: `Rupee ${dir > 0 ? 'weakens' : 'strengthens'} ~${(eff.pct * 100).toFixed(0)}% against major currencies` };
    }
    case 'tech_discount': {
      const track = pick(s, TECH_IDS);
      s.flags[`techDiscount|${track}`] = 0.5;
      return { text: `Next ${track} upgrade costs 50% less` };
    }
    case 'inventory_damage': {
      let lostValue = 0;
      for (const id in s.inventory) {
        const inv = s.inventory[id];
        const [, cost] = takeFinished(inv, inv.finished * eff.pct * severity);
        lostValue += cost;
      }
      if (lostValue > 0) recordOpex(s, 'writeoffs', lostValue);
      return { text: `Inventory worth ₹${Math.round(lostValue).toLocaleString('en-IN')} destroyed` };
    }
  }
}

export function securityIncident(s: SimState, severity: number): { text: string; decisionId?: string } {
  const ind = industryOf(s);
  const sev = clamp(randRange(s, 0.3, 1) * severity * (s.security.vulnerability / 60), 0.15, 1.5);
  const recovery = Math.round((500000 + lastRevenue(s) * 0.25 * sev) * (1 - 0.1 * s.tech.levels.cybersecurity));
  payExpense(s, 'security', recovery, 'Breach recovery');
  const lostPct = 0.02 + 0.06 * sev * ind.cyberExposure;
  let lost = 0;
  for (const k in s.cells) { const x = s.cells[k].customers * lostPct; s.cells[k].customers -= x; lost += x; }
  s.month.churned += lost;
  s.company.brand = clamp(s.company.brand - 6 * sev, 0, 100);
  s.company.reputation.customer = clamp(s.company.reputation.customer - 8 * sev, 0, 100);
  let fine = 0;
  if (ind.regulation > 0.7) {
    fine = Math.round(recovery * 0.8);
    payExpense(s, 'legal', fine, 'Regulatory fine (data breach)');
    s.company.reputation.regulatory = clamp(s.company.reputation.regulatory - 10 * sev, 0, 100);
  }
  s.security.incidents += 1;
  s.security.lastIncidentDay = s.day;
  s.security.recoveringUntil = s.day + 45;
  s.security.vulnerability = clamp(s.security.vulnerability * 0.8, 0, 100);
  s.modifiers.push({ id: uid(s, 'm'), target: 'conversion', value: 1 - 0.2 * sev, scope: null, startDay: s.day, endDay: s.day + 60, source: 'Breach fallout' });
  return { text: `Recovery ₹${recovery.toLocaleString('en-IN')}${fine ? `, fine ₹${fine.toLocaleString('en-IN')}` : ''}; ${Math.round(lost).toLocaleString('en-IN')} customers left; brand −${(6 * sev).toFixed(0)}` };
}

export function openLegalCase(s: SimState, kind: LegalCase['kind'], title: string, exposure: number): { text: string; decisionId: string } {
  const lawyers = roleCapacity(s, 'lawyer');
  const lc: LegalCase = {
    id: uid(s, 'lc'),
    kind,
    title,
    exposure: Math.round(exposure),
    monthlyCost: Math.round(exposure * 0.03),
    winProbability: clamp(0.4 + lawyers * 0.08 + (s.departments.legal.budget > 0 ? 0.05 : 0), 0.1, 0.85),
    openedDay: s.day,
    resolveDay: s.day + randInt(s, 120, 300),
    status: 'open',
    fighting: false,
  };
  s.legalCases.push(lc);
  const d = createDecision(s, {
    kind: 'legal_case',
    category: 'crisis',
    title: `${title}: settle or fight?`,
    description: `Potential damages ₹${(lc.exposure / 1e5).toFixed(1)} lakh. Fighting costs about ₹${(lc.monthlyCost / 1e5).toFixed(1)} lakh/month in legal fees until resolved; your estimated chance of winning is ${(lc.winProbability * 100).toFixed(0)}% (more legal counsel improves this).`,
    days: 21,
    options: [
      { id: 'settle', label: 'Settle now', description: 'Pay ~55% of exposure and move on.', consequences: [`−₹${((lc.exposure * 0.55) / 1e5).toFixed(1)}L now`, 'No further risk'] },
      { id: 'fight', label: 'Fight in court', description: 'Pay legal fees; win and pay nothing, lose and pay full damages.', consequences: [`${(lc.winProbability * 100).toFixed(0)}% chance to win`, `−₹${(lc.monthlyCost / 1e5).toFixed(1)}L/month in fees`, `Lose: −₹${(lc.exposure / 1e5).toFixed(1)}L`] },
    ],
    defaultOption: 'fight',
    data: { caseId: lc.id },
  });
  return { text: `Exposure ₹${Math.round(lc.exposure).toLocaleString('en-IN')}`, decisionId: d.id };
}

function eventDecision(s: SimState, kind: string, ctx: Record<string, string>): { text?: string; decisionId?: string } {
  if (kind === 'viral_moment') {
    const budget = Math.round(Math.max(200000, lastRevenue(s) * 0.3));
    const d = createDecision(s, {
      kind: 'viral_moment', category: 'opportunity', title: `Ride the wave: ${ctx.product ?? 'your product'} is trending`,
      description: 'Attention is peaking right now. Spending on paid social and influencers while it lasts can convert curiosity into customers.',
      days: 10,
      options: [
        { id: 'boost', label: `Spend ₹${(budget / 1e5).toFixed(1)}L on a burst campaign`, description: 'One-month burst on social and influencers.', consequences: ['Awareness +, more customers', `−₹${(budget / 1e5).toFixed(1)}L`] },
        { id: 'ignore', label: 'Let it play out organically', description: 'Save the cash.', consequences: ['Smaller, free awareness lift'] },
      ],
      defaultOption: 'ignore', data: { budget },
    });
    return { decisionId: d.id };
  }
  if (kind === 'celebrity') {
    const fee = Math.round(Math.max(1500000, lastRevenue(s) * 0.5));
    const d = createDecision(s, {
      kind: 'celebrity', category: 'opportunity', title: 'Celebrity endorsement offer',
      description: `A well-known personality will endorse ${ctx.product ?? 'your product'} for ₹${(fee / 1e5).toFixed(1)} lakh. Endorsements lift brand and conversion, but carry reputational risk.`,
      days: 14,
      options: [
        { id: 'sign', label: 'Sign the endorsement', description: 'Pay the fee.', consequences: ['Brand +6', 'Conversion +15% for 4 months', '10% chance of a scandal (brand −8)', `−₹${(fee / 1e5).toFixed(1)}L`] },
        { id: 'decline', label: 'Decline', description: 'Not worth it.', consequences: ['Nothing changes'] },
      ],
      defaultOption: 'decline', data: { fee },
    });
    return { decisionId: d.id };
  }
  if (kind === 'key_employee') {
    const senior = [...s.employees].filter((e) => e.role !== 'founder').sort((a, b) => b.skill * b.level - a.skill * a.level)[0];
    if (!senior) return {};
    const d = createDecision(s, {
      kind: 'key_employee', category: 'crisis', title: `${senior.name} has an offer from a competitor`,
      description: `Your ${senior.level >= 4 ? 'lead' : 'senior'} ${senior.role.replace('_', ' ')} (skill ${senior.skill.toFixed(0)}) is considering leaving. Replacing them would take months.`,
      days: 7,
      options: [
        { id: 'counter', label: 'Counter-offer +30%', description: 'Match and beat the offer.', consequences: [`Salary ₹${senior.salary.toLocaleString('en-IN')} → ₹${Math.round(senior.salary * 1.3).toLocaleString('en-IN')}`, 'Others may expect raises (small morale dip elsewhere)'] },
        { id: 'promote', label: 'Promote them', description: 'Promotion with a raise and a bigger role.', consequences: ['Level +1', 'Loyalty ↑'] },
        { id: 'let_go', label: 'Let them go', description: 'Wish them well.', consequences: ['They leave immediately'] },
      ],
      defaultOption: 'let_go', data: { employeeId: senior.id },
    });
    return { decisionId: d.id };
  }
  return {};
}

export function monthlyLegal(s: SimState): void {
  for (const lc of s.legalCases) {
    if (lc.status !== 'open') continue;
    if (lc.fighting) payExpense(s, 'legal', lc.monthlyCost, 'Legal fees');
    if (s.day >= lc.resolveDay && lc.fighting) {
      if (chance(s, lc.winProbability)) {
        lc.status = 'won';
        addNews(s, `${s.company.name} wins in court`, `${lc.title} was dismissed.`, 'company', 'positive');
      } else {
        lc.status = 'lost';
        payExpense(s, 'legal', lc.exposure, 'Legal damages');
        s.company.reputation.regulatory = clamp(s.company.reputation.regulatory - 5, 0, 100);
        addNews(s, `${s.company.name} loses its court case`, `Damages of ₹${(lc.exposure / 1e5).toFixed(1)} lakh awarded.`, 'company', 'negative');
      }
    }
  }
}

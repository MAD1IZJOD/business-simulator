// Technology upgrades, R&D projects and patents.
import { RESEARCH_PROJECTS, TECHNOLOGIES, techCost } from '../data/technology';
import { MANAGEMENT_STYLES } from '../data/roles';
import type { SimState, TechTrack } from '../types';
import { launchedProducts, roleCapacity } from '../context';
import { chance, randInt, randRange } from '../rng';
import { clamp } from '../util';
import { moveCash, payExpense } from './ledger';
import { addAsset } from './assets';
import { addNews } from './news';

export function researchCapacity(s: SimState): number {
  const researchers = roleCapacity(s, 'researcher') + roleCapacity(s, 'data_scientist') * 0.4;
  const budgetPts = s.research.budget / 300000;
  const labs = s.facilities.filter((f) => f.kind === 'lab').reduce((a, f) => a + f.capacity, 0);
  const labF = 1 + Math.min(0.3, labs * 0.03);
  const culture = 0.8 + 0.4 * (s.company.culture.innovation / 100);
  return (researchers * 1.2 + budgetPts) * labF * culture * MANAGEMENT_STYLES[s.company.managementStyle].rdEff;
}

export function upgradeCost(s: SimState, track: TechTrack): number {
  const next = s.tech.levels[track] + 1;
  const discount = Number(s.flags[`techDiscount|${track}`] ?? 1);
  return techCost(track, next) * s.macro.priceLevel * discount;
}

export function startTechUpgrade(s: SimState, track: TechTrack): { ok: boolean; message: string } {
  if (s.tech.upgrading) return { ok: false, message: 'Another upgrade is already in progress.' };
  const lvl = s.tech.levels[track];
  if (lvl >= 5) return { ok: false, message: 'Already at maximum level.' };
  const cost = upgradeCost(s, track);
  if (s.finance.cash < cost) return { ok: false, message: `Need ₹${Math.round(cost).toLocaleString('en-IN')}.` };
  // Research capacity shortens implementation.
  const months = Math.max(1, TECHNOLOGIES[track].months * (lvl + 1) * 0.6 / (1 + researchCapacity(s) / 6));
  addAsset(s, `${TECHNOLOGIES[track].name} L${lvl + 1}`, 'software', cost, 60);
  moveCash(s, -cost, 'investing', 'Technology investment');
  delete s.flags[`techDiscount|${track}`];
  s.tech.upgrading = { track, doneDay: s.day + Math.round(months * 30) };
  return { ok: true, message: `${TECHNOLOGIES[track].name} level ${lvl + 1} in ~${Math.round(months * 30)} days.` };
}

export function startResearch(s: SimState, id: string): { ok: boolean; message: string } {
  const def = RESEARCH_PROJECTS.find((r) => r.id === id);
  if (!def) return { ok: false, message: 'Unknown project.' };
  if (s.research.unlocked.includes(id)) return { ok: false, message: 'Already researched.' };
  if (!def.requires.every((r) => s.research.unlocked.includes(r))) return { ok: false, message: 'Prerequisites not met.' };
  s.research.active = id;
  if (!s.research.projects[id]) s.research.projects[id] = { id, progress: 0, status: 'active' };
  s.research.projects[id].status = 'active';
  return { ok: true, message: `Researching ${def.name}.` };
}

function unlock(s: SimState, id: string): void {
  const def = RESEARCH_PROJECTS.find((r) => r.id === id)!;
  s.research.unlocked.push(id);
  s.research.projects[id].status = 'done';
  s.research.active = null;
  if (def.unlock === 'quality') for (const p of launchedProducts(s)) p.quality = clamp(p.quality + def.value, 0, 100);
  addNews(s, `${s.company.name} R&D breakthrough: ${def.name}`, def.description, 'company', 'positive');
}

export function monthlyTech(s: SimState): void {
  if (s.research.budget > 0) payExpense(s, 'rd', s.research.budget, 'Research lab');
  const pts = researchCapacity(s);
  s.research.pointsThisMonth = pts;
  s.metrics.researchCapacity = pts;
  const active = s.research.active;
  if (active) {
    const def = RESEARCH_PROJECTS.find((r) => r.id === active);
    const proj = s.research.projects[active];
    if (def && proj) {
      proj.progress += pts;
      if (proj.progress >= def.points) unlock(s, active);
    }
  }
  const up = s.tech.upgrading;
  if (up && s.day >= up.doneDay) {
    s.tech.levels[up.track] += 1;
    s.tech.upgrading = null;
    addNews(s, `${TECHNOLOGIES[up.track].name} upgraded to level ${s.tech.levels[up.track]}`, TECHNOLOGIES[up.track].effects.join('; '), 'company', 'positive');
  }
  // Patents
  for (const p of s.products) {
    const pt = p.patent;
    if (!pt || pt.status !== 'pending' || s.day < pt.decisionDay) continue;
    const pGrant = clamp(0.45 + (s.research.unlocked.includes('novel_ip') ? 0.3 : 0) + p.quality / 400 + (s.employees.some((e) => e.role === 'lawyer') ? 0.1 : 0), 0.1, 0.95);
    if (chance(s, pGrant)) {
      pt.status = 'granted';
      pt.expiresDay = s.day + 20 * 365;
      addNews(s, `Patent granted for ${p.name}`, 'Competitors will find it harder to copy this product.', 'company', 'positive');
    } else {
      pt.status = 'rejected';
      addNews(s, `Patent application for ${p.name} rejected`, 'The examiner found insufficient novelty.', 'company', 'negative');
    }
  }
}

export function filePatent(s: SimState, productId: string): { ok: boolean; message: string } {
  const p = s.products.find((x) => x.id === productId);
  if (!p || p.stage === 'idea') return { ok: false, message: 'Product not found.' };
  if (p.patent && (p.patent.status === 'pending' || p.patent.status === 'granted')) return { ok: false, message: 'A patent is already pending or granted.' };
  const cost = 800000;
  payExpense(s, 'legal', cost, 'Patent filing');
  p.patent = {
    status: 'pending',
    filedDay: s.day,
    decisionDay: s.day + randInt(s, 300, 600),
    expiresDay: 0,
    strength: clamp(0.5 + (s.research.unlocked.includes('novel_ip') ? 0.35 : 0) + randRange(s, 0, 0.15), 0, 1),
  };
  return { ok: true, message: `Patent filed for ${p.name}. A decision takes 10–20 months.` };
}

/** Security vulnerability (0–100) and monthly security spend. */
export function monthlySecurity(s: SimState, cyberExposure: number, customers: number): void {
  if (s.security.budget > 0) payExpense(s, 'security', s.security.budget, 'Security program');
  const secEng = roleCapacity(s, 'security_engineer');
  const base = cyberExposure * 55 + Math.log10(customers + 10) * 6;
  const v = base * (1 - 0.12 * s.tech.levels.cybersecurity) * (1 - 0.35 * Math.min(1, s.security.budget / 500000)) * (1 - Math.min(0.45, secEng * 0.09));
  s.security.vulnerability = clamp(s.security.vulnerability * 0.6 + v * 0.4, 1, 100);
}

// Hiring takes time: openings attract candidates at a rate driven by the salary
// offered, employer reputation, unemployment and HR capacity. Candidates can be
// interviewed (reducing uncertainty about skill), negotiated with, and join after
// a notice period.
import { LEVEL_SKILL, MANAGEMENT_STYLES, ROLES } from '../data/roles';
import type { Candidate, JobOpening, RoleId, SimState } from '../types';
import { dim, modifier, roleCapacity, roleName } from '../context';
import { chance, rand, randNormal, randRange } from '../rng';
import { clamp, uid } from '../util';
import { payExpense } from './ledger';
import { createEmployee, marketSalary, randomName } from './employees';

export function openJob(
  s: SimState,
  opts: { role: RoleId; level: number; count: number; salaryOffer?: number; marketId?: string; autoHire?: boolean; minSkill?: number },
): JobOpening {
  const marketId = opts.marketId ?? s.config.hqMarket;
  const level = clamp(Math.round(opts.level), 1, 5);
  const job: JobOpening = {
    id: uid(s, 'j'),
    role: opts.role,
    level,
    count: Math.max(1, Math.floor(opts.count)),
    filled: 0,
    salaryOffer: Math.round(opts.salaryOffer ?? marketSalary(s, opts.role, level, marketId)),
    marketId,
    openedDay: s.day,
    autoHire: opts.autoHire ?? true,
    minSkill: opts.minSkill ?? LEVEL_SKILL[level] - 10,
    candidates: [],
    candidateAccumulator: 0,
  };
  s.openings.push(job);
  return job;
}

export function closeJob(s: SimState, id: string): void {
  s.openings = s.openings.filter((j) => j.id !== id);
}

function remaining(j: JobOpening, s: SimState): number {
  const pending = s.pendingHires.filter((p) => p.openingId === j.id).length;
  return j.count - j.filled - pending;
}

export function hrFactor(s: SimState): number {
  const open = s.openings.reduce((a, j) => a + Math.max(0, remaining(j, s)), 0);
  if (open <= 0) return 1;
  const cap = roleCapacity(s, 'recruiter') * 6 + 1.5; // founder can run a couple of searches
  return 0.55 + 0.65 * Math.min(1, cap / open);
}

/** Candidate arrivals per day for an opening. */
export function candidateRate(s: SimState, j: JobOpening): number {
  const market = marketSalary(s, j.role, j.level, j.marketId);
  const payF = Math.pow(clamp(j.salaryOffer / market, 0.4, 2), 3);
  const employer = 0.5 + s.company.reputation.employer / 100;
  const brand = 0.85 + s.company.brand / 330;
  const unemployment = clamp(s.macro.unemployment / 7, 0.5, 2);
  const seniority = [1, 1.3, 1, 0.75, 0.5, 0.35][j.level];
  const style = MANAGEMENT_STYLES[s.company.managementStyle].hiringSpeed;
  return 0.3 * payF * employer * brand * unemployment * seniority * hrFactor(s) * style * modifier(s, 'hiring_speed');
}

function newCandidate(s: SimState, j: JobOpening): Candidate {
  const market = marketSalary(s, j.role, j.level, j.marketId);
  const offerRatio = j.salaryOffer / market;
  const skill = clamp(randNormal(s, LEVEL_SKILL[j.level] + (offerRatio - 1) * 18, 9), 10, 99);
  const ask = market * (1 + (skill - LEVEL_SKILL[j.level]) / 60) * randRange(s, 0.95, 1.18);
  const uncertainty = 15 - s.tech.levels.analytics;
  return {
    id: uid(s, 'c'),
    name: randomName(s),
    skill,
    perceivedSkill: clamp(skill + randNormal(s, 0, uncertainty), 5, 99),
    uncertainty,
    experience: Math.max(0, j.level * 2 - 1 + randNormal(s, 0, 1.5)),
    askSalary: Math.round(ask),
    flexibility: randRange(s, 0.03, 0.12),
    interest: clamp(0.5 + (s.company.reputation.employer - 50) / 100 + (offerRatio - 1), 0.1, 0.98),
    interviewed: false,
    arrivedDay: s.day,
    expiresDay: s.day + 21,
    status: 'new',
  };
}

function recruitingFee(s: SimState, salary: number): number {
  // Agencies charge ~8% of annual salary; an in-house recruiter cuts that to ~2%.
  const recruiters = roleCapacity(s, 'recruiter');
  return salary * 12 * (recruiters >= 1 ? 0.02 : 0.08);
}

/** Make an offer. Returns 'accepted' | 'countered' | 'declined'. */
export function makeOffer(s: SimState, jobId: string, candidateId: string, amount: number): { result: 'accepted' | 'countered' | 'declined'; message: string } {
  const j = s.openings.find((x) => x.id === jobId);
  const c = j?.candidates.find((x) => x.id === candidateId);
  if (!j || !c || (c.status !== 'new' && c.status !== 'offered')) return { result: 'declined', message: 'Candidate is no longer available.' };
  if (remaining(j, s) <= 0) return { result: 'declined', message: 'This opening is already filled.' };
  const floor = c.askSalary * (1 - c.flexibility);
  if (amount >= floor && chance(s, clamp(c.interest + 0.25, 0, 1))) {
    c.status = 'accepted';
    const notice = Math.round(randRange(s, 14, 35));
    s.pendingHires.push({ id: uid(s, 'ph'), candidate: c, openingId: j.id, role: j.role, level: j.level, salary: Math.round(amount), marketId: j.marketId, startDay: s.day + notice });
    payExpense(s, 'recruiting', recruitingFee(s, amount), 'Recruiting fees');
    return { result: 'accepted', message: `${c.name} accepted ₹${Math.round(amount).toLocaleString('en-IN')}/month and starts in ${notice} days.` };
  }
  if (amount >= c.askSalary * 0.85 && c.status === 'new') {
    c.status = 'offered';
    c.counterOffer = Math.round(c.askSalary * (1 - c.flexibility / 2));
    return { result: 'countered', message: `${c.name} countered at ₹${c.counterOffer.toLocaleString('en-IN')}/month.` };
  }
  c.status = 'declined';
  return { result: 'declined', message: `${c.name} declined the offer.` };
}

export function interview(s: SimState, jobId: string, candidateId: string): string {
  const j = s.openings.find((x) => x.id === jobId);
  const c = j?.candidates.find((x) => x.id === candidateId);
  if (!c) return 'Candidate not found.';
  if (c.interviewed) return 'Already interviewed.';
  payExpense(s, 'recruiting', 5000, 'Interview costs');
  c.interviewed = true;
  c.uncertainty = 4;
  c.perceivedSkill = clamp(c.skill + randNormal(s, 0, 4), 5, 99);
  c.expiresDay += 3;
  return `Interviewed ${c.name}: assessed skill ≈ ${c.perceivedSkill.toFixed(0)}.`;
}

export function rejectCandidate(s: SimState, jobId: string, candidateId: string): void {
  const c = s.openings.find((x) => x.id === jobId)?.candidates.find((x) => x.id === candidateId);
  if (c) c.status = 'rejected';
}

export function dailyHiring(s: SimState): void {
  const days = dim(s);
  // Pending hires join.
  const joining = s.pendingHires.filter((p) => p.startDay <= s.day);
  if (joining.length) {
    for (const p of joining) {
      const e = createEmployee(s, p.role, p.level, p.marketId, { skill: p.candidate.skill, salary: p.salary, name: p.candidate.name, experience: p.candidate.experience });
      // Senior hires get options from the pool.
      if (p.level >= 3) {
        const pool = s.capTable.find((h) => h.kind === 'option_pool');
        if (pool && pool.shares > 0) {
          const grant = Math.min(pool.shares, Math.round(pool.shares * 0.01 * p.level));
          pool.shares -= grant;
          e.options = grant;
          let emp = s.capTable.find((h) => h.kind === 'employee');
          if (!emp) { emp = { id: uid(s, 'sh'), name: 'Employee grants', kind: 'employee', shares: 0, invested: 0, round: null }; s.capTable.push(emp); }
          emp.shares += grant;
        }
      }
      s.employees.push(e);
      s.month.hires += 1;
      const j = s.openings.find((x) => x.id === p.openingId);
      if (j) j.filled += 1;
    }
    s.pendingHires = s.pendingHires.filter((p) => p.startDay > s.day);
  }
  for (const j of s.openings) {
    const need = remaining(j, s);
    for (const c of j.candidates) if (c.status === 'new' && c.expiresDay <= s.day) c.status = 'expired';
    if (need <= 0) continue;
    j.candidateAccumulator += candidateRate(s, j) * Math.max(1, Math.sqrt(need)) * (30 / days);
    while (j.candidateAccumulator >= 1) {
      j.candidateAccumulator -= 1;
      j.candidates.push(newCandidate(s, j));
    }
    if (j.candidateAccumulator > 0 && rand(s) < j.candidateAccumulator * 0.02) {
      j.candidateAccumulator = 0;
      j.candidates.push(newCandidate(s, j));
    }
    if (j.autoHire) {
      const pool = j.candidates.filter((c) => c.status === 'new' && c.perceivedSkill >= j.minSkill).sort((a, b) => b.perceivedSkill - a.perceivedSkill);
      for (const c of pool) {
        if (remaining(j, s) <= 0) break;
        if (c.askSalary * (1 - c.flexibility) <= j.salaryOffer * 1.05) makeOffer(s, j.id, c.id, Math.max(c.askSalary * (1 - c.flexibility), Math.min(c.askSalary, j.salaryOffer)));
      }
    }
    if (j.candidates.length > 40) j.candidates = j.candidates.filter((c) => c.status === 'new' || c.status === 'offered').slice(-40);
  }
  // Openings that are fully filled close automatically.
  s.openings = s.openings.filter((j) => j.filled < j.count);
}

export function hireSummary(s: SimState, role: RoleId): string {
  return `${roleName(s, role)} — ${ROLES[role].description}`;
}

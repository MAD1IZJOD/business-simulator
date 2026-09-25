// Individual employees: productivity, morale, burnout, attrition, payroll.
import { FIRST_NAMES, LAST_NAMES } from '../data/names';
import { LEVEL_SALARY, LEVEL_SKILL, MANAGEMENT_STYLES, ROLES } from '../data/roles';
import type { DeptId, Employee, RoleId, SimState } from '../types';
import { dim, fxRatio, industryOf, marketSalaryIndex, modifier, payrollTaxRate, roleName } from '../context';
import { chance, pick, randNormal } from '../rng';
import { addTo, approach, clamp, saturate, uid } from '../util';
import { moveCash, payExpense, recordCogs, recordOpex } from './ledger';
import { addNews } from './news';

/** Market salary for a role/level in a market (INR per month, home-currency terms). */
export function marketSalary(s: SimState, role: RoleId, level: number, marketId: string): number {
  const base = role === 'specialist' ? industryOf(s).specialistSalary : ROLES[role].baseSalary;
  return base * LEVEL_SALARY[clamp(Math.round(level), 1, 5)] * marketSalaryIndex(marketId) * s.macro.priceLevel * modifier(s, 'wage');
}

export function randomName(s: SimState): string {
  return `${pick(s, FIRST_NAMES)} ${pick(s, LAST_NAMES)}`;
}

export function createEmployee(
  s: SimState,
  role: RoleId,
  level: number,
  marketId: string,
  opts: { skill?: number; salary?: number; name?: string; experience?: number; startProductive?: boolean } = {},
): Employee {
  const skill = clamp(opts.skill ?? randNormal(s, LEVEL_SKILL[level], 8), 10, 99);
  const e: Employee = {
    id: uid(s, 'e'),
    name: opts.name ?? randomName(s),
    role,
    dept: ROLES[role].dept,
    level,
    salary: Math.round(opts.salary ?? marketSalary(s, role, level, marketId)),
    skill,
    experience: opts.experience ?? Math.max(0, level * 2 - 1 + randNormal(s, 0, 1)),
    morale: 70,
    burnout: 5,
    loyalty: 55,
    performance: 1,
    productivity: 0,
    marketId,
    hireDay: opts.startProductive ? s.day - 365 : s.day,
    probationEndDay: s.day + 90,
    lastPromotionDay: s.day,
    options: 0,
    key: level >= 4,
  };
  e.productivity = computeProductivity(s, e);
  return e;
}

const DIRECT_LABOR: RoleId[] = ['production_worker', 'specialist'];

export function isDirectLabor(s: SimState, role: RoleId): boolean {
  const f = industryOf(s).fulfillment;
  return DIRECT_LABOR.includes(role) && (f === 'manufactured' || f === 'service' || role === 'production_worker');
}

export function monthlyCost(s: SimState, e: Employee): number {
  const salary = e.role === 'founder' ? s.company.founderSalary : e.salary;
  return salary * fxRatio(s, e.marketId) * (1 + payrollTaxRate(s, e.marketId));
}

export function payrollMonthly(s: SimState): number {
  let t = 0;
  for (const e of s.employees) t += monthlyCost(s, e);
  return t;
}

/** Daily payroll accrual: expense now, paid in cash at month end. */
export function dailyPayroll(s: SimState): void {
  const days = dim(s);
  for (const e of s.employees) {
    const cost = monthlyCost(s, e) / days;
    if (cost <= 0) continue;
    if (isDirectLabor(s, e.role)) {
      recordCogs(s, 'labor', cost);
      addTo(s.month.salaryByDept, e.dept, cost);
    } else recordOpex(s, 'salaries', cost, e.dept);
    s.finance.accruedPayroll += cost;
  }
}

export function payPayroll(s: SimState): void {
  if (s.finance.accruedPayroll > 0) {
    moveCash(s, -s.finance.accruedPayroll, 'operating', 'Payroll');
    s.finance.accruedPayroll = 0;
  }
}

export function deptBudgetPerHead(s: SimState, dept: DeptId): number {
  const n = s.employees.filter((e) => e.dept === dept).length;
  return n > 0 ? s.departments[dept].budget / n : 0;
}

export function computeProductivity(s: SimState, e: Employee): number {
  const skillF = clamp(e.skill / 60, 0.3, 1.7);
  const moraleF = clamp(0.6 + 0.8 * (e.morale / 100), 0.55, 1.3);
  const burnF = 1 - 0.5 * (e.burnout / 100);
  const tenure = s.day - e.hireDay;
  const ramp = Math.min(1, 0.35 + 0.65 * (tenure / 90));
  let tech = 1;
  if (e.dept === 'operations') tech += 0.06 * s.tech.levels.automation;
  if (e.dept === 'sales') tech += 0.04 * s.tech.levels.ai;
  if (e.dept === 'customer_success') tech += 0.03 * s.tech.levels.ai;
  const office = s.metrics.officeUtilization > 1 ? clamp(1 - 0.3 * (s.metrics.officeUtilization - 1), 0.6, 1) : 1;
  const style = MANAGEMENT_STYLES[s.company.managementStyle].productivity;
  const collab = 0.9 + 0.2 * (s.company.culture.collaboration / 100);
  const tools = 1 + 0.12 * saturate(deptBudgetPerHead(s, e.dept), 10000);
  const events = modifier(s, 'productivity');
  return Math.max(0.05, skillF * moraleF * burnF * ramp * tech * office * style * collab * tools * events);
}

/** Workload pressure per department (1 = sustainable). */
export function deptWorkload(s: SimState, dept: DeptId): number {
  switch (dept) {
    case 'engineering': {
      const crunch = s.products.some((p) => (p.stage === 'development' && p.dev.progress < 1 || p.updating) && p.dev.speed === 'crunch');
      const active = s.products.filter((p) => (p.stage === 'development' && p.dev.progress < 1) || p.updating).length;
      return (crunch ? 1.45 : 1) * (active > 2 ? 1.1 : 1);
    }
    case 'customer_success':
      return s.month.ticketCapacity > 0 ? clamp(s.month.tickets / s.month.ticketCapacity, 0.4, 2.5) : 1;
    case 'operations':
      return clamp(Math.max(s.metrics.serviceUtilization, avgFactoryUtil(s)), 0.4, 2.5) || 1;
    case 'sales': {
      const q = Object.values(s.sales.pipeline).reduce((a, b) => a + b.qualified + b.proposal, 0);
      const cap = s.employees.filter((e) => e.dept === 'sales').length * 25;
      return cap > 0 ? clamp(q / cap, 0.5, 2) : 1;
    }
    case 'executive':
      return s.employees.length < 8 ? 1.3 : 1;
    default:
      return 1;
  }
}

function avgFactoryUtil(s: SimState): number {
  const fs = s.factories.filter((f) => f.status === 'operational');
  return fs.length ? fs.reduce((a, f) => a + f.utilization, 0) / fs.length : 0;
}

export interface MoraleTerms {
  salary: number;
  workload: number;
  management: number;
  layoffs: number;
  company_performance: number;
  growth_opportunities: number;
  culture: number;
  remote_policy: number;
  office: number;
  welfare: number;
}

export function companyPerformanceTerm(s: SimState): number {
  const r = s.reports;
  let t = 0;
  if (r.length >= 3) {
    const a = r[r.length - 1].kpis.revenue;
    const b = r[r.length - 3].kpis.revenue;
    if (b > 0) t += clamp(((a / b) - 1) * 20, -8, 8);
  }
  const runway = s.reports.length ? s.reports[s.reports.length - 1].kpis.runwayMonths : 24;
  if (runway < 3) t -= 10;
  else if (runway < 6) t -= 5;
  return t;
}

export function moraleTerms(s: SimState, e: Employee, perf: number, headGrowth: number): MoraleTerms {
  const mkt = marketSalary(s, e.role, e.level, e.marketId);
  const salary = e.role === 'founder' ? 5 : clamp(25 * Math.log(Math.max(1, e.salary) / Math.max(1, mkt)), -20, 12);
  const sinceProm = (s.day - e.lastPromotionDay) / 365;
  const growth = (sinceProm < 1 ? 5 : sinceProm > 2.5 ? -5 : 0) + clamp(headGrowth * 10, -4, 5);
  const offices = s.facilities.filter((f) => f.kind === 'office');
  const officeQ = offices.length ? offices.reduce((a, f) => a + f.quality, 0) / offices.length : 45;
  const crowd = s.metrics.officeUtilization > 1 ? -12 * (s.metrics.officeUtilization - 1) : 0;
  const remote = s.company.remotePolicy === 'remote' ? 4 : s.company.remotePolicy === 'hybrid' ? 3 : 0;
  const welfarePerHead = s.employees.length ? s.esg.welfareBudget / s.employees.length : 0;
  return {
    salary,
    workload: -e.burnout * 0.25,
    management: MANAGEMENT_STYLES[s.company.managementStyle].morale,
    layoffs: -30 * s.company.layoffShock,
    company_performance: perf,
    growth_opportunities: growth,
    culture: (s.company.culture.collaboration - 50) / 10 + (s.company.culture.satisfaction - 50) / 15,
    remote_policy: remote,
    office: s.company.remotePolicy === 'remote' ? 0 : (officeQ - 50) / 10 + crowd,
    welfare: 6 * saturate(welfarePerHead, 5000) + (e.options > 0 ? 3 : 0),
  };
}

/** Monthly: burnout, morale, skills, loyalty, attrition and productivity. */
export function monthlyEmployees(s: SimState): void {
  const style = MANAGEMENT_STYLES[s.company.managementStyle];
  const perf = companyPerformanceTerm(s);
  const prevHead = s.reports.length ? s.reports[s.reports.length - 1].kpis.employees : s.employees.length;
  const headGrowth = prevHead > 0 ? s.employees.length / prevHead - 1 : 0;
  const workloads = new Map<DeptId, number>();
  const termSums: Record<string, number> = {};
  const unemployment = s.macro.unemployment;
  const market = clamp(1 + (7 - unemployment) / 10, 0.6, 1.6);
  const employerF = clamp(1 + (55 - s.company.reputation.employer) / 100, 0.6, 1.5);
  const leavers: Employee[] = [];

  for (const e of s.employees) {
    let wl = workloads.get(e.dept);
    if (wl === undefined) { wl = deptWorkload(s, e.dept); workloads.set(e.dept, wl); }
    const recovery = wl < 0.9 ? -8 : wl < 1.05 ? -3 : 0;
    e.burnout = clamp(e.burnout + (wl - 1) * 18 + style.burnout + recovery, 0, 100);
    const t = moraleTerms(s, e, perf, headGrowth);
    let target = 55;
    for (const k in t) {
      const v = t[k as keyof MoraleTerms];
      target += v;
      termSums[k] = (termSums[k] ?? 0) + v;
    }
    e.morale = clamp(approach(e.morale, clamp(target, 0, 100), 0.3), 0, 100);
    const training = saturate(deptBudgetPerHead(s, e.dept), 15000);
    e.skill = clamp(e.skill + 0.2 * (1 + training) * (e.skill < 80 ? 1 : 0.3), 0, 99);
    e.experience += 1 / 12;
    e.loyalty = clamp(e.loyalty + 0.6 - s.company.layoffShock * 8 + (e.morale - 50) / 50, 0, 100);
    e.productivity = computeProductivity(s, e);
    if (e.role === 'founder') continue;
    const pQuit = 0.012 * Math.exp((50 - e.morale) / 18) * (1.3 - (e.loyalty / 100) * 0.6) * style.attrition * market * employerF;
    if (chance(s, clamp(pQuit, 0, 0.5))) leavers.push(e);
  }
  // Performance relative to role average.
  const byRole = new Map<RoleId, number[]>();
  for (const e of s.employees) {
    const arr = byRole.get(e.role) ?? [];
    arr.push(e.productivity);
    byRole.set(e.role, arr);
  }
  for (const e of s.employees) {
    const arr = byRole.get(e.role) ?? [1];
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    e.performance = avg > 0 ? e.productivity / avg : 1;
  }
  for (const e of leavers) {
    s.employees = s.employees.filter((x) => x.id !== e.id);
    s.month.quits += 1;
    if (e.key || e.level >= 4) addNews(s, `${e.name} leaves ${s.company.name}`, `A ${roleName(s, e.role).toLowerCase()} (level ${e.level}) resigned. Morale was ${e.morale.toFixed(0)}.`, 'company', 'negative');
  }
  const n = Math.max(1, s.employees.length + leavers.length);
  for (const k in termSums) s.month.drv[`morale.${k}`] = termSums[k] / n;
  s.month.drv['morale.__base'] = 55;
  s.company.layoffShock = Math.max(0, s.company.layoffShock * 0.75 - 0.02);
}

export function averageMorale(s: SimState): number {
  if (!s.employees.length) return 0;
  return s.employees.reduce((a, e) => a + e.morale, 0) / s.employees.length;
}

export function averageProductivity(s: SimState): number {
  if (!s.employees.length) return 0;
  return s.employees.reduce((a, e) => a + e.productivity, 0) / s.employees.length;
}

export function severanceFor(s: SimState, e: Employee): number {
  if (s.day < e.probationEndDay) return 0;
  const years = (s.day - e.hireDay) / 365;
  return e.salary * fxRatio(s, e.marketId) * Math.max(1, Math.min(6, years));
}

export function terminate(s: SimState, id: string, reason: 'termination' | 'layoff' = 'termination'): string {
  const e = s.employees.find((x) => x.id === id);
  if (!e) return 'Employee not found.';
  if (e.role === 'founder') return 'The founder cannot be terminated.';
  const sev = severanceFor(s, e);
  payExpense(s, 'severance', sev, 'Severance');
  s.employees = s.employees.filter((x) => x.id !== id);
  if (reason === 'layoff') s.month.layoffs += 1;
  s.company.layoffShock = clamp(s.company.layoffShock + 1.5 / Math.max(5, s.employees.length), 0, 1);
  return sev > 0 ? `${e.name} let go. Severance ₹${Math.round(sev).toLocaleString('en-IN')}.` : `${e.name} let go during probation (no severance).`;
}

export function layoff(s: SimState, dept: DeptId | null, count: number): string {
  const pool = s.employees
    .filter((e) => e.role !== 'founder' && (dept === null || e.dept === dept))
    .sort((a, b) => a.performance - b.performance);
  const victims = pool.slice(0, Math.max(0, Math.floor(count)));
  if (!victims.length) return 'Nobody to lay off.';
  let sev = 0;
  for (const v of victims) {
    sev += severanceFor(s, v);
    terminate(s, v.id, 'layoff');
  }
  const share = victims.length / Math.max(1, s.employees.length + victims.length);
  s.company.layoffShock = clamp(s.company.layoffShock + share * 2.5, 0, 1);
  s.company.lastLayoffDay = s.day;
  s.company.reputation.employer = clamp(s.company.reputation.employer - share * 40, 0, 100);
  for (const e of s.employees) e.loyalty = clamp(e.loyalty - share * 30, 0, 100);
  addNews(s, `${s.company.name} lays off ${victims.length} employees`, `About ${(share * 100).toFixed(0)}% of staff${dept ? ` in ${dept}` : ''}. Severance ≈ ₹${Math.round(sev).toLocaleString('en-IN')}.`, 'company', 'negative');
  return `Laid off ${victims.length}. Severance ₹${Math.round(sev).toLocaleString('en-IN')}. Morale and employer reputation will suffer.`;
}

export function promote(s: SimState, id: string): string {
  const e = s.employees.find((x) => x.id === id);
  if (!e || e.role === 'founder') return 'Cannot promote.';
  if (e.level >= 5) return `${e.name} is already at the top level.`;
  e.level += 1;
  e.salary = Math.round(Math.max(e.salary * 1.25, marketSalary(s, e.role, e.level, e.marketId)));
  e.morale = clamp(e.morale + 15, 0, 100);
  e.loyalty = clamp(e.loyalty + 12, 0, 100);
  e.lastPromotionDay = s.day;
  e.key = e.level >= 4;
  for (const o of s.employees) if (o.dept === e.dept && o.id !== e.id) o.morale = clamp(o.morale + 1, 0, 100);
  return `${e.name} promoted to level ${e.level}. New salary ₹${e.salary.toLocaleString('en-IN')}/month.`;
}

export function giveRaise(s: SimState, id: string, pct: number): string {
  const e = s.employees.find((x) => x.id === id);
  if (!e || e.role === 'founder') return 'Cannot change this salary.';
  e.salary = Math.round(e.salary * (1 + pct / 100));
  e.morale = clamp(e.morale + pct * 0.8, 0, 100);
  e.loyalty = clamp(e.loyalty + pct * 0.5, 0, 100);
  return `${e.name}'s salary is now ₹${e.salary.toLocaleString('en-IN')}/month.`;
}

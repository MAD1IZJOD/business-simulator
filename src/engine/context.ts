// Read-only helpers that derive commonly used values from state + static data.
import { AUDIENCES, GTM, MONETIZATIONS } from './data/businessModels';
import { DIFFICULTIES } from './data/difficulty';
import { INDUSTRIES, isPhysical } from './data/industries';
import { COUNTRIES, MARKET_BY_ID, marketDef } from './data/markets';
import { ROLES } from './data/roles';
import { SEGMENTS } from './data/segments';
import type { DeptId, ModifierTarget, Product, RoleId, SegmentId, SimState } from './types';
import { daysInMonth, currentDate } from './calendar';

export const industryOf = (s: SimState) => INDUSTRIES[s.config.industry];
export const difficultyOf = (s: SimState) => DIFFICULTIES[s.config.difficulty];
export const gtmOf = (s: SimState) => GTM[s.company.gtm];
export const audienceOf = (s: SimState) => AUDIENCES[s.company.audience];
export const monetizationOf = (p: Product) => MONETIZATIONS[p.monetization];
export const physical = (s: SimState) => isPhysical(industryOf(s));
export const hqCountry = (s: SimState) => COUNTRIES[marketDef(s.config.hqMarket).country];

export function dim(s: SimState): number {
  const d = currentDate(s);
  return daysInMonth(d.year, d.month);
}

/** Current FX ratio (current/base) for a market's currency, relative to INR. */
export function fxRatio(s: SimState, marketId: string): number {
  const m = MARKET_BY_ID[marketId];
  if (!m) return 1;
  const cur = COUNTRIES[m.country].currency;
  if (cur === 'INR') return 1;
  const base = s.macro.fxBase[cur] ?? 1;
  const now = s.macro.fx[cur] ?? base;
  return base > 0 ? now / base : 1;
}

/** Product of all active modifiers on a target (optionally matching a scope). */
export function modifier(s: SimState, target: ModifierTarget, scope?: string | null): number {
  let v = 1;
  for (const m of s.modifiers) {
    if (m.target !== target) continue;
    if (m.startDay > s.day || m.endDay < s.day) continue;
    if (m.scope && scope !== undefined && m.scope !== scope) continue;
    if (m.scope && scope === undefined) continue;
    v *= m.value;
  }
  return v;
}

export function activeModifiers(s: SimState) {
  return s.modifiers.filter((m) => m.startDay <= s.day && m.endDay >= s.day);
}

export function headcount(s: SimState, role?: RoleId): number {
  if (!role) return s.employees.length;
  let n = 0;
  for (const e of s.employees) if (e.role === role) n++;
  return n;
}

export function deptHeadcount(s: SimState, dept: DeptId): number {
  let n = 0;
  for (const e of s.employees) if (e.dept === dept) n++;
  return n;
}

/** Sum of productivity for a role (effective FTEs). The founder contributes a bit everywhere early on. */
export function roleCapacity(s: SimState, role: RoleId): number {
  let t = 0;
  for (const e of s.employees) {
    if (e.role === role) t += e.productivity;
  }
  const founder = s.employees.find((e) => e.role === 'founder');
  if (founder) {
    const n = s.employees.length;
    const founderShare = n <= 3 ? 0.35 : n <= 10 ? 0.15 : 0;
    const helps: Partial<Record<RoleId, number>> = { engineer: 1, account_executive: 1, sdr: 0.6, marketer: 0.6, support_agent: 0.5, specialist: 0.6, cs_manager: 0.4, finance_analyst: 0.3 };
    const w = helps[role];
    if (w) t += founder.productivity * founderShare * w;
  }
  return t;
}

export function deptCapacity(s: SimState, dept: DeptId): number {
  let t = 0;
  for (const e of s.employees) if (e.dept === dept) t += e.productivity;
  return t;
}

export function segmentsFor(s: SimState): SegmentId[] {
  const ind = industryOf(s);
  return (Object.keys(ind.adoption) as SegmentId[]).filter((k) => (ind.adoption[k] ?? 0) > 0);
}

export function enteredMarkets(s: SimState) {
  return s.markets.filter((m) => m.entered);
}

export function launchedProducts(s: SimState) {
  return s.products.filter((p) => p.stage === 'launched');
}

export function totalCustomers(s: SimState): number {
  let t = 0;
  for (const k in s.cells) t += s.cells[k].customers;
  return t;
}

export function totalFreeUsers(s: SimState): number {
  let t = 0;
  for (const k in s.cells) t += s.cells[k].freeUsers;
  return t;
}

export function customersOfProduct(s: SimState, productId: string): number {
  let t = 0;
  for (const k in s.cells) if (s.cells[k].productId === productId) t += s.cells[k].customers;
  return t;
}

export function isSalesLed(_s: SimState, p: Product, seg: SegmentId): boolean {
  const def = SEGMENTS[seg];
  if (def.kind !== 'business') return false;
  if (def.salesLed) return true;
  return MONETIZATIONS[p.monetization].salesLedBoost >= 0.5;
}

export function roleName(s: SimState, role: RoleId): string {
  if (role === 'specialist') return industryOf(s).specialistLabel;
  return ROLES[role].name;
}

export function marketSalaryIndex(marketId: string): number {
  return MARKET_BY_ID[marketId]?.laborCost ?? 1;
}

export function payrollTaxRate(s: SimState, marketId: string): number {
  const c = COUNTRIES[MARKET_BY_ID[marketId]?.country ?? 'IN'];
  return (c?.payrollTax ?? 12) / 100 + (s.company.managementStyle === 'employee_focused' ? 0.05 : 0);
}

export function corporateTaxRate(s: SimState): number {
  return hqCountry(s).corporateTax / 100;
}

export function founderShares(s: SimState): number {
  return s.capTable.filter((h) => h.kind === 'founder').reduce((a, h) => a + h.shares, 0);
}

export function totalShares(s: SimState): number {
  return s.capTable.reduce((a, h) => a + h.shares, 0);
}

export function founderOwnership(s: SimState): number {
  const t = totalShares(s);
  return t > 0 ? founderShares(s) / t : 0;
}

export { GTM, MONETIZATIONS, SEGMENTS, INDUSTRIES, AUDIENCES };

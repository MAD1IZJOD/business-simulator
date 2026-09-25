// State validation: detects and repairs invalid simulation states (NaN, negative
// inventory, impossible counts, broken dates) and checks accounting identities.
import type { SimState } from './types';
import { balanceGap } from './systems/ledger';

export interface ValidationIssue {
  path: string;
  problem: string;
  repaired: boolean;
}

/** Walk the state and replace non-finite numbers with 0 (Infinity allowed only where meaningful). */
function scanNumbers(obj: unknown, path: string, issues: ValidationIssue[], repair: boolean, depth = 0): void {
  if (depth > 12 || obj === null || typeof obj !== 'object') return;
  const rec = obj as Record<string, unknown>;
  for (const key of Object.keys(rec)) {
    const v = rec[key];
    const p = `${path}.${key}`;
    if (typeof v === 'number') {
      if (Number.isNaN(v) || (!Number.isFinite(v) && !key.startsWith('runway'))) {
        issues.push({ path: p, problem: `non-finite number (${v})`, repaired: repair });
        if (repair) rec[key] = 0;
      }
    } else if (typeof v === 'object' && v !== null) {
      // Reports are immutable history and large; only scan the latest one.
      if (key === 'reports' && Array.isArray(v)) {
        if (v.length) scanNumbers(v[v.length - 1], `${p}[last]`, issues, repair, depth + 1);
        continue;
      }
      if (key === 'history') continue;
      scanNumbers(v, p, issues, repair, depth + 1);
    }
  }
}

export function validateState(s: SimState, repair = true): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  scanNumbers(s, 'state', issues, repair);
  if (!Number.isInteger(s.day) || s.day < 0) {
    issues.push({ path: 'state.day', problem: 'invalid day', repaired: repair });
    if (repair) s.day = Math.max(0, Math.floor(Number.isFinite(s.day) ? s.day : 0));
  }
  for (const [id, inv] of Object.entries(s.inventory)) {
    for (const k of ['finished', 'finishedValue', 'raw', 'rawValue', 'wip', 'wipValue', 'damaged'] as const) {
      if (inv[k] < -1e-6) {
        issues.push({ path: `inventory.${id}.${k}`, problem: 'negative inventory', repaired: repair });
        if (repair) inv[k] = 0;
      }
    }
  }
  for (const [k, c] of Object.entries(s.cells)) {
    if (c.customers < 0 || c.freeUsers < 0) {
      issues.push({ path: `cells.${k}`, problem: 'negative customers', repaired: repair });
      if (repair) { c.customers = Math.max(0, c.customers); c.freeUsers = Math.max(0, c.freeUsers); }
    }
  }
  const ids = new Set<string>();
  for (const e of s.employees) {
    if (ids.has(e.id)) issues.push({ path: `employees.${e.id}`, problem: 'duplicate employee id', repaired: false });
    ids.add(e.id);
    if (e.salary < 0) { issues.push({ path: `employees.${e.id}.salary`, problem: 'negative salary', repaired: repair }); if (repair) e.salary = 0; }
  }
  if (!s.employees.some((e) => e.role === 'founder')) issues.push({ path: 'employees', problem: 'founder missing', repaired: false });
  for (const h of s.capTable) if (h.shares < 0) { issues.push({ path: `capTable.${h.id}`, problem: 'negative shares', repaired: repair }); if (repair) h.shares = 0; }
  const gap = balanceGap(s);
  if (Math.abs(gap) > 1) issues.push({ path: 'finance', problem: `balance sheet out of balance by ${gap.toFixed(2)}`, repaired: false });
  return issues;
}

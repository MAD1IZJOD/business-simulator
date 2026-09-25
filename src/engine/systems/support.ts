// Customer support: ticket volume from customers and defects, capacity from
// support staff (plus AI deflection); response time follows a queueing curve.
import { SEGMENTS } from '../data/segments';
import type { SimState } from '../types';
import { dim, industryOf, modifier, roleCapacity } from '../context';
import { clamp } from '../util';

export const TICKETS_PER_AGENT = 450;

export function dailySupport(s: SimState): void {
  const ind = industryOf(s);
  const days = dim(s);
  let volume = 0;
  let defects = 0;
  let n = 0;
  for (const p of s.products) if (p.stage === 'launched') { defects += p.defectRate; n++; }
  const avgDefect = n ? defects / n : 0;
  for (const k in s.cells) {
    const c = s.cells[k];
    volume += (c.customers + c.freeUsers * 0.1) * ind.ticketsPerCustomer * SEGMENTS[c.segmentId].ticketMult;
  }
  for (const ct of s.contracts) if (ct.status === 'active') volume += ct.supportLoad;
  volume *= (1 + avgDefect * 8) * (1 - Math.min(0.5, 0.08 * s.tech.levels.ai));
  const toolBoost = 1 + 0.1 * clamp(s.departments.customer_success.budget / 100000, 0, 1);
  const capacity = (roleCapacity(s, 'support_agent') * TICKETS_PER_AGENT + roleCapacity(s, 'cs_manager') * 80) * toolBoost;
  s.month.tickets += volume / days;
  s.month.ticketCapacity += capacity / days;
}

/** Response time in hours from month-to-date load. */
export function responseHoursFor(tickets: number, capacity: number): number {
  if (tickets <= 0.5) return 2;
  if (capacity <= 0) return 120;
  const u = tickets / capacity;
  return clamp(3 + 6 * Math.pow(u, 3) + (u > 1 ? (u - 1) * 60 : 0), 2, 168);
}

export function monthlySupport(s: SimState): void {
  const hours = responseHoursFor(s.month.tickets, s.month.ticketCapacity);
  s.metrics.responseHours = s.metrics.responseHours * 0.4 + hours * 0.6;
  // Reliability (digital uptime / service reliability).
  const ind = industryOf(s);
  let debt = 0;
  let n = 0;
  for (const p of s.products) if (p.stage === 'launched') { debt += p.techDebt; n++; }
  const avgDebt = n ? debt / n : 0;
  const infra = s.tech.levels.infrastructure;
  const outage = modifier(s, 'outage');
  const base = ind.fulfillment === 'digital' ? 93 : 90;
  const target = clamp(base + infra * 1.5 - avgDebt / 12 - (outage - 1) * 20 - s.metrics.outageDays * 2, 30, 99.9);
  s.metrics.reliability = s.metrics.reliability * 0.5 + target * 0.5;
  s.metrics.outageDays = 0;
  s.metrics.securityScore = clamp(100 - s.security.vulnerability, 0, 100);
}

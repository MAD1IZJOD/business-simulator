// Calendar helpers. Simulation time is an integer day offset from the start date.
import type { SimState } from './types';

export interface SimDate {
  year: number;
  month: number; // 1..12
  day: number; // 1..31
}

const MS_PER_DAY = 86400000;

export function dateOf(startYear: number, startMonth: number, dayOffset: number): SimDate {
  const t = Date.UTC(startYear, startMonth - 1, 1) + dayOffset * MS_PER_DAY;
  const d = new Date(t);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function currentDate(s: SimState): SimDate {
  return dateOf(s.startYear, s.startMonth, s.day);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function dayOfDate(s: SimState, year: number, month: number, day = 1): number {
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(s.startYear, s.startMonth - 1, 1)) / MS_PER_DAY);
}

/** Day offset of the first day of the next month relative to the current day. */
export function nextMonthStart(s: SimState): number {
  const d = currentDate(s);
  const y = d.month === 12 ? d.year + 1 : d.year;
  const m = d.month === 12 ? 1 : d.month + 1;
  return dayOfDate(s, y, m, 1);
}

export function nextQuarterStart(s: SimState): number {
  const d = currentDate(s);
  const q = Math.floor((d.month - 1) / 3);
  let m = (q + 1) * 3 + 1;
  let y = d.year;
  if (m > 12) { m -= 12; y += 1; }
  return dayOfDate(s, y, m, 1);
}

export function nextYearStart(s: SimState): number {
  const d = currentDate(s);
  return dayOfDate(s, d.year + 1, 1, 1);
}

export function quarterOf(month: number): number {
  return Math.floor((month - 1) / 3) + 1;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(d: SimDate): string {
  return `${d.day} ${MONTHS[d.month - 1]} ${d.year}`;
}

export function formatMonth(year: number, month: number): string {
  return `${MONTHS[month - 1]} ${year}`;
}

export function formatDay(s: SimState, dayOffset: number): string {
  return formatDate(dateOf(s.startYear, s.startMonth, dayOffset));
}

export function monthLabel(s: SimState, dayOffset: number): string {
  const d = dateOf(s.startYear, s.startMonth, dayOffset);
  return formatMonth(d.year, d.month);
}

export function isLastDayOfMonth(s: SimState): boolean {
  const d = currentDate(s);
  return d.day === daysInMonth(d.year, d.month);
}

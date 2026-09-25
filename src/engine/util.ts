import type { SimState } from './types';

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
export const avg = (xs: readonly number[]): number => (xs.length ? sum(xs) / xs.length : 0);
export const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

/** Replace non-finite numbers with a fallback. */
export function safe(v: number, fallback = 0): number {
  return Number.isFinite(v) ? v : fallback;
}

export function uid(s: SimState, prefix: string): string {
  s.counters.nextId += 1;
  return `${prefix}${s.counters.nextId.toString(36)}`;
}

export function addTo<K extends string>(rec: Record<K, number>, key: K, v: number): void {
  rec[key] = (rec[key] ?? 0) + v;
}

export function cellKey(productId: string, marketId: string, segmentId: string): string {
  return `${productId}|${marketId}|${segmentId}`;
}

export function msKey(marketId: string, segmentId: string): string {
  return `${marketId}|${segmentId}`;
}

/** Smoothly move `current` toward `target` by `rate` (0..1). */
export const approach = (current: number, target: number, rate: number): number => current + (target - current) * rate;

export function round(v: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

/** Diminishing returns curve: 0 at x=0, → 1 as x → ∞, reaches ~63% at x=scale. */
export const saturate = (x: number, scale: number): number => (scale <= 0 ? 0 : 1 - Math.exp(-Math.max(0, x) / scale));

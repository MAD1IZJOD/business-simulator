// Seeded, serializable PRNG (sfc32). All engine randomness flows through here so a
// seed plus the same sequence of decisions reproduces the same simulation.
import type { RngState, SimState } from './types';

export function seedRng(seed: number): RngState {
  // splitmix32 to spread the seed across 128 bits of state
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
  const st: RngState = [next(), next(), next(), next()];
  // warm up
  for (let i = 0; i < 12; i++) nextFloat(st);
  return st;
}

export function nextFloat(st: RngState): number {
  let [a, b, c, d] = st;
  a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
  const t = (((a + b) >>> 0) + d) >>> 0;
  d = (d + 1) >>> 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) >>> 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) >>> 0;
  st[0] = a >>> 0; st[1] = b >>> 0; st[2] = c >>> 0; st[3] = d;
  return t / 4294967296;
}

/** Uniform [0,1) from the simulation's RNG stream. */
export function rand(s: SimState): number {
  return nextFloat(s.rng);
}

export function randRange(s: SimState, lo: number, hi: number): number {
  return lo + (hi - lo) * rand(s);
}

export function randInt(s: SimState, lo: number, hi: number): number {
  return Math.floor(randRange(s, lo, hi + 1));
}

export function chance(s: SimState, p: number): boolean {
  return rand(s) < p;
}

/** Standard normal via Box-Muller. */
export function randNormal(s: SimState, mean = 0, sd = 1): number {
  const u = Math.max(1e-12, rand(s));
  const v = rand(s);
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function pick<T>(s: SimState, arr: readonly T[]): T {
  return arr[Math.floor(rand(s) * arr.length) % arr.length];
}

export function weightedPick<T>(s: SimState, items: readonly T[], weight: (t: T) => number): T | null {
  let total = 0;
  for (const it of items) total += Math.max(0, weight(it));
  if (total <= 0) return null;
  let r = rand(s) * total;
  for (const it of items) {
    r -= Math.max(0, weight(it));
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

/** Poisson-distributed count for small lambdas (Knuth); normal approx for large. */
export function randPoisson(s: SimState, lambda: number): number {
  if (lambda <= 0) return 0;
  if (lambda > 30) return Math.max(0, Math.round(randNormal(s, lambda, Math.sqrt(lambda))));
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand(s);
  } while (p > L);
  return k - 1;
}

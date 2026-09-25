// Save-file format: versioned JSON with a checksum. Infinity (e.g. runway when
// cash-flow positive) survives the round trip. Loading validates structure and
// repairs recoverable problems instead of silently accepting a broken state.
import type { SimState } from '../engine/types';
import { SCHEMA_VERSION } from '../engine/create';
import { validateState } from '../engine/validate';

export const SAVE_FORMAT = 'business-sim-save';

export interface SaveEnvelope {
  format: typeof SAVE_FORMAT;
  version: number;
  savedAt: string;
  checksum: string;
  meta: SaveMeta;
  state: SimState;
}

export interface SaveMeta {
  company: string;
  industry: string;
  day: number;
  dateLabel: string;
  cash: number;
  valuation: number;
  status: string;
}

const INF = '__Infinity__';
const NINF = '__-Infinity__';
const NAN = '__NaN__';

function replacer(_k: string, v: unknown): unknown {
  if (v === Infinity) return INF;
  if (v === -Infinity) return NINF;
  if (typeof v === 'number' && Number.isNaN(v)) return NAN;
  return v;
}

function reviver(_k: string, v: unknown): unknown {
  if (v === INF) return Infinity;
  if (v === NINF) return -Infinity;
  if (v === NAN) return Number.NaN; // repaired by validation after load
  return v;
}

/** Small, fast non-cryptographic checksum (FNV-1a) to detect corrupted files. */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function serialize(s: SimState, meta: SaveMeta): string {
  const stateJson = JSON.stringify(s, replacer);
  const env = { format: SAVE_FORMAT, version: SCHEMA_VERSION, savedAt: new Date().toISOString(), checksum: checksum(stateJson), meta, stateJson };
  return JSON.stringify(env);
}

export class SaveError extends Error {}

const REQUIRED: (keyof SimState)[] = ['schemaVersion', 'config', 'company', 'products', 'markets', 'finance', 'employees', 'reports', 'month', 'macro', 'rng', 'day', 'capTable', 'competitors'];

export function deserialize(text: string): { state: SimState; meta: SaveMeta; repaired: number } {
  let env: { format?: string; version?: number; checksum?: string; meta?: SaveMeta; stateJson?: string };
  try {
    env = JSON.parse(text);
  } catch {
    throw new SaveError('This file is not valid JSON.');
  }
  if (env.format !== SAVE_FORMAT || typeof env.stateJson !== 'string') throw new SaveError('This is not a Business Simulator save file.');
  if (typeof env.version !== 'number' || env.version > SCHEMA_VERSION) throw new SaveError(`Save version ${env.version} is newer than this game supports (${SCHEMA_VERSION}).`);
  if (env.checksum !== checksum(env.stateJson)) throw new SaveError('The save file is corrupted (checksum mismatch).');
  let state: SimState;
  try {
    state = JSON.parse(env.stateJson, reviver) as SimState;
  } catch {
    throw new SaveError('The saved state could not be parsed.');
  }
  for (const k of REQUIRED) if (state[k] === undefined) throw new SaveError(`The save is missing "${String(k)}".`);
  if (!Array.isArray(state.rng) || state.rng.length !== 4) throw new SaveError('The random-number state is invalid.');
  state = migrate(state);
  const issues = validateState(state, true);
  const unrepairable = issues.filter((i) => !i.repaired && i.problem.startsWith('founder'));
  if (unrepairable.length) throw new SaveError(`The save is invalid: ${unrepairable.map((i) => i.problem).join(', ')}.`);
  return { state, meta: env.meta ?? metaOf(state), repaired: issues.filter((i) => i.repaired).length };
}

/** Upgrade older save schemas in place. */
export function migrate(s: SimState): SimState {
  // Version 1 is the first schema; future versions add steps here.
  s.schemaVersion = SCHEMA_VERSION;
  s.flags = s.flags ?? {};
  s.log = s.log ?? [];
  return s;
}

export function metaOf(s: SimState): SaveMeta {
  const d = new Date(Date.UTC(s.startYear, s.startMonth - 1, 1) + s.day * 86400000);
  return {
    company: s.company.name,
    industry: s.config.industry,
    day: s.day,
    dateLabel: d.toISOString().slice(0, 10),
    cash: s.finance.cash,
    valuation: s.metrics.valuation,
    status: s.status,
  };
}

// Save slots in IndexedDB (saves can be several MB), with an in-memory fallback
// when IndexedDB is unavailable. Small preferences and the leaderboard live in
// localStorage. Every access is guarded: private windows may block storage.
import type { SimState } from '../engine/types';
import { deserialize, metaOf, serialize } from './serialize';
import type { SaveMeta } from './serialize';

export interface SlotInfo {
  slot: string;
  meta: SaveMeta;
  savedAt: string;
}

export interface SaveBackend {
  put(slot: string, text: string): Promise<void>;
  get(slot: string): Promise<string | null>;
  remove(slot: string): Promise<void>;
  keys(): Promise<string[]>;
}

export class MemoryBackend implements SaveBackend {
  private data = new Map<string, string>();
  async put(slot: string, text: string) { this.data.set(slot, text); }
  async get(slot: string) { return this.data.get(slot) ?? null; }
  async remove(slot: string) { this.data.delete(slot); }
  async keys() { return [...this.data.keys()]; }
}

const DB_NAME = 'business-simulator';
const STORE = 'saves';

class IdbBackend implements SaveBackend {
  private dbp: Promise<IDBDatabase>;
  constructor() {
    this.dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  private async tx<T>(mode: IDBTransactionMode, fn: (st: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.dbp;
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async put(slot: string, text: string) { await this.tx('readwrite', (st) => st.put(text, slot)); }
  async get(slot: string) { return ((await this.tx('readonly', (st) => st.get(slot))) as string | undefined) ?? null; }
  async remove(slot: string) { await this.tx('readwrite', (st) => st.delete(slot)); }
  async keys() { return ((await this.tx('readonly', (st) => st.getAllKeys())) as IDBValidKey[]).map(String); }
}

function makeBackend(): SaveBackend {
  try {
    if (typeof indexedDB !== 'undefined') return new IdbBackend();
  } catch {
    /* fall through */
  }
  return new MemoryBackend();
}

export class SaveStore {
  constructor(private backend: SaveBackend = makeBackend()) {}

  async save(slot: string, s: SimState): Promise<void> {
    await this.backend.put(slot, serialize(s, metaOf(s)));
  }

  async load(slot: string): Promise<SimState> {
    const text = await this.backend.get(slot);
    if (!text) throw new Error('That save slot is empty.');
    return deserialize(text).state;
  }

  async remove(slot: string): Promise<void> {
    await this.backend.remove(slot);
  }

  async list(): Promise<SlotInfo[]> {
    const out: SlotInfo[] = [];
    for (const k of await this.backend.keys()) {
      const text = await this.backend.get(k);
      if (!text) continue;
      try {
        const env = JSON.parse(text) as { meta: SaveMeta; savedAt: string };
        out.push({ slot: k, meta: env.meta, savedAt: env.savedAt });
      } catch {
        out.push({ slot: k, meta: { company: '(corrupted save)', industry: '', day: 0, dateLabel: '', cash: 0, valuation: 0, status: 'corrupted' }, savedAt: '' });
      }
    }
    return out.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }

  exportText(s: SimState): string {
    return serialize(s, metaOf(s));
  }

  importText(text: string): SimState {
    return deserialize(text).state;
  }
}

// ------------------------------------------------------------ preferences & leaderboard

export function readLocal<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeLocal(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: preferences are best-effort */
  }
}

export interface LeaderboardEntry {
  runId: string;
  company: string;
  industry: string;
  difficulty: string;
  months: number;
  peakRevenue: number; // best monthly revenue
  peakProfit: number;
  peakValuation: number;
  peakShare: number;
  fastestCroreMonths: number | null; // months to ₹1 Cr annual run-rate
  outcome: string;
  updatedAt: string;
}

const LB_KEY = 'bizsim.leaderboard';

export function leaderboardEntry(s: SimState): LeaderboardEntry {
  const r = s.reports;
  const crore = r.findIndex((x) => x.kpis.runRate >= 1e7);
  return {
    runId: s.runId,
    company: s.company.name,
    industry: s.config.industry,
    difficulty: s.config.difficulty,
    months: r.length,
    peakRevenue: Math.max(0, ...r.map((x) => x.kpis.revenue)),
    peakProfit: Math.max(0, ...r.map((x) => x.kpis.netIncome)),
    peakValuation: Math.max(0, ...r.map((x) => x.kpis.valuation)),
    peakShare: Math.max(0, ...r.map((x) => x.kpis.marketShare)),
    fastestCroreMonths: crore >= 0 ? crore + 1 : null,
    outcome: s.outcome?.title ?? (s.status === 'running' ? 'Operating' : 'Ended'),
    updatedAt: new Date().toISOString(),
  };
}

export function recordLeaderboard(s: SimState): void {
  const list = readLocal<LeaderboardEntry[]>(LB_KEY, []);
  const e = leaderboardEntry(s);
  const idx = list.findIndex((x) => x.runId === e.runId);
  if (idx >= 0) list[idx] = e;
  else list.push(e);
  writeLocal(LB_KEY, list.slice(-100));
}

export function readLeaderboard(): LeaderboardEntry[] {
  return readLocal<LeaderboardEntry[]>(LB_KEY, []);
}

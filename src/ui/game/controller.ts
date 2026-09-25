// GameController owns the live simulation, the clock and persistence. React
// subscribes to a version counter; components read state straight from the
// controller and change it only through dispatch().
import type { CommandResult } from '../../engine/commands';
import { createGame } from '../../engine/create';
import type { ProjectionSummary, Comparison, WhatIfAction } from '../../engine/projection';
import { stepDay } from '../../engine/step';
import type { GameConfig, SimState } from '../../engine/types';
import { validateState } from '../../engine/validate';
import { recordLeaderboard, readLocal, SaveStore, writeLocal } from '../../persistence/storage';
import { setNumberStyle } from '../format';
import type { NumberStyle } from '../format';
import { nextMonthStart, nextQuarterStart, nextYearStart } from '../../engine/calendar';

export type AdvanceUnit = 'day' | 'week' | 'month' | 'quarter' | 'year';

export interface Toast {
  id: number;
  text: string;
  tone: 'good' | 'bad' | 'warn' | 'info';
}

export interface Settings {
  theme: 'dark' | 'light';
  numberStyle: NumberStyle;
  autosave: boolean;
  pauseOnDecision: boolean;
  speed: number; // 1..5
}

const SETTINGS_KEY = 'bizsim.settings';
const DEFAULT_SETTINGS: Settings = { theme: 'dark', numberStyle: 'indian', autosave: true, pauseOnDecision: true, speed: 2 };

/** Days simulated per tick and tick interval (ms) for each speed. */
const SPEEDS: Record<number, [number, number]> = { 1: [1, 600], 2: [1, 220], 3: [3, 200], 4: [7, 200], 5: [15, 200] };

export class GameController {
  state: SimState | null = null;
  version = 0;
  running = false;
  busy = false;
  toasts: Toast[] = [];
  settings: Settings;
  store = new SaveStore();
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private toastId = 0;
  private worker: Worker | null = null;
  private workerSeq = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  constructor() {
    this.settings = { ...DEFAULT_SETTINGS, ...readLocal<Partial<Settings>>(SETTINGS_KEY, {}) };
    setNumberStyle(this.settings.numberStyle);
    this.applyTheme();
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = (): number => this.version;

  notify(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  // ------------------------------------------------------------------ lifecycle

  newGame(config: GameConfig): void {
    this.pause();
    this.state = createGame(config);
    this.notify();
    void this.autosave();
  }

  load(s: SimState): void {
    this.pause();
    this.state = s;
    this.notify();
  }

  quit(): void {
    this.pause();
    this.state = null;
    this.notify();
  }

  // ------------------------------------------------------------------ commands

  dispatch = (fn: (s: SimState) => CommandResult | void, silent = false): CommandResult | void => {
    const s = this.state;
    if (!s) return;
    let res: CommandResult | void;
    try {
      res = fn(s);
    } catch (err) {
      res = { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
    if (res && !silent) this.toast(res.message, res.ok ? 'good' : 'bad');
    this.notify();
    return res;
  };

  toast(text: string, tone: Toast['tone'] = 'info'): void {
    if (!text) return;
    const t = { id: ++this.toastId, text, tone };
    this.toasts = [...this.toasts.slice(-4), t];
    this.notify();
    setTimeout(() => {
      this.toasts = this.toasts.filter((x) => x.id !== t.id);
      this.notify();
    }, tone === 'bad' ? 6000 : 4000);
  }

  // ------------------------------------------------------------------ clock

  private stepOnce(): boolean {
    const s = this.state!;
    const openBefore = s.decisions.filter((d) => !d.resolved).length;
    const closed = stepDay(s);
    if (closed) this.onMonthClosed();
    const openAfter = s.decisions.filter((d) => !d.resolved).length;
    if (this.settings.pauseOnDecision && openAfter > openBefore && this.running) {
      const d = s.decisions.find((x) => !x.resolved);
      this.pause();
      this.toast(`Decision needed: ${d?.title ?? ''}`, 'warn');
      return false;
    }
    if (s.status !== 'running') {
      this.pause();
      return false;
    }
    return true;
  }

  private onMonthClosed(): void {
    const s = this.state!;
    const issues = validateState(s, true);
    const real = issues.filter((i) => !i.path.startsWith('finance'));
    if (real.length) s.log.push(...real.map((i) => `${i.path}: ${i.problem}`));
    recordLeaderboard(s);
    void this.autosave();
  }

  /** Advance by a calendar unit. Large jumps are chunked so the UI stays responsive. */
  advance(unit: AdvanceUnit): void {
    const s = this.state;
    if (!s || s.status !== 'running' || this.busy) return;
    const target = unit === 'day' ? s.day + 1 : unit === 'week' ? s.day + 7 : unit === 'month' ? nextMonthStart(s) : unit === 'quarter' ? nextQuarterStart(s) : nextYearStart(s);
    this.pause();
    this.busy = true;
    const run = () => {
      const st = this.state;
      if (!st) { this.busy = false; return; }
      let n = 0;
      let cont = true;
      while (st.day < target && n < 20 && cont) {
        cont = this.stepOnceStopping();
        n++;
      }
      this.notify();
      if (st.day < target && cont && st.status === 'running') setTimeout(run, 0);
      else { this.busy = false; this.notify(); }
    };
    run();
  }

  private stepOnceStopping(): boolean {
    const s = this.state!;
    const openBefore = s.decisions.filter((d) => !d.resolved).length;
    const closed = stepDay(s);
    if (closed) this.onMonthClosed();
    if (s.status !== 'running') return false;
    const newDecision = s.decisions.filter((d) => !d.resolved).length > openBefore;
    if (newDecision && this.settings.pauseOnDecision) {
      const d = s.decisions.find((x) => !x.resolved);
      this.toast(`Decision needed: ${d?.title ?? ''}`, 'warn');
      return false;
    }
    return true;
  }

  play(): void {
    if (!this.state || this.state.status !== 'running' || this.running) return;
    this.running = true;
    this.notify();
    const tick = () => {
      if (!this.running) return;
      const [days, ms] = SPEEDS[this.settings.speed] ?? SPEEDS[2];
      for (let i = 0; i < days; i++) if (!this.stepOnce()) break;
      this.notify();
      if (this.running) this.timer = setTimeout(tick, ms);
    };
    this.timer = setTimeout(tick, 0);
  }

  pause(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.notify();
  }

  toggle(): void {
    if (this.running) this.pause();
    else this.play();
  }

  setSpeed(n: number): void {
    this.updateSettings({ speed: Math.max(1, Math.min(5, n)) });
  }

  // ------------------------------------------------------------------ settings & saves

  updateSettings(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    writeLocal(SETTINGS_KEY, this.settings);
    setNumberStyle(this.settings.numberStyle);
    this.applyTheme();
    this.notify();
  }

  private applyTheme(): void {
    if (typeof document !== 'undefined') document.documentElement.dataset.theme = this.settings.theme;
  }

  async autosave(): Promise<void> {
    if (!this.state || !this.settings.autosave) return;
    try {
      await this.store.save('autosave', this.state);
    } catch {
      /* storage may be unavailable (private mode); the game keeps running */
    }
  }

  async saveTo(slot: string): Promise<void> {
    if (!this.state) return;
    try {
      await this.store.save(slot, this.state);
      this.toast(`Saved to ${slot}.`, 'good');
    } catch (e) {
      this.toast(`Save failed: ${e instanceof Error ? e.message : e}`, 'bad');
    }
  }

  async loadFrom(slot: string): Promise<boolean> {
    try {
      const s = await this.store.load(slot);
      this.load(s);
      this.toast(`Loaded ${s.company.name}.`, 'good');
      return true;
    } catch (e) {
      this.toast(`Load failed: ${e instanceof Error ? e.message : e}`, 'bad');
      return false;
    }
  }

  // ------------------------------------------------------------------ projections

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('./projection.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; result?: unknown; error?: string }>) => {
        const p = this.pending.get(e.data.id);
        if (!p) return;
        this.pending.delete(e.data.id);
        if (e.data.ok) p.resolve(e.data.result);
        else p.reject(new Error(e.data.error));
      };
    }
    return this.worker;
  }

  private request<T>(msg: Record<string, unknown>): Promise<T> {
    const id = ++this.workerSeq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.getWorker().postMessage({ ...msg, id });
    });
  }

  forecast(months: number, runs: number): Promise<ProjectionSummary> {
    return this.request<ProjectionSummary>({ kind: 'forecast', state: this.state, months, runs });
  }

  compare(planA: WhatIfAction[], planB: WhatIfAction[], months: number, runs: number): Promise<Comparison> {
    return this.request<Comparison>({ kind: 'compare', state: this.state, planA, planB, months, runs });
  }
}

export const game = new GameController();

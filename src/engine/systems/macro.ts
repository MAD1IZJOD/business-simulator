// Macroeconomy: a regime-switching business cycle. Each phase pulls indicators
// toward its own targets; recessions differ by kind (demand, financial, supply)
// and severity, so no two downturns look the same.
import { COUNTRIES } from '../data/markets';
import type { MacroPhase, MacroState, RecessionKind, SimState } from '../types';
import { modifier } from '../context';
import { chance, pick, randInt, randNormal, randRange } from '../rng';
import { approach, clamp } from '../util';
import { addNews } from './news';

interface Targets { gdp: number; cc: number; bc: number; unemp: number; infl: number; rate: number; funding: number; market: number }

function targets(m: MacroState): Targets {
  const sev = m.severity;
  switch (m.phase) {
    case 'boom': return { gdp: 8.5, cc: 70, bc: 72, unemp: 5.5, infl: 6.5, rate: 7, funding: 1.35, market: 0.022 };
    case 'slowdown': return { gdp: 4.5, cc: 46, bc: 44, unemp: 7.6, infl: 5.5, rate: 6.8, funding: 0.85, market: -0.004 };
    case 'recession': {
      const k = m.recessionKind ?? 'demand';
      return {
        gdp: 0.8 - sev * 4,
        cc: 32 - sev * 12,
        bc: 30 - sev * 14,
        unemp: 9 + sev * 3.5,
        infl: k === 'supply' ? 9 + sev * 3 : 3.5,
        rate: k === 'supply' ? 8 : k === 'financial' ? 5.5 : 5,
        funding: k === 'financial' ? 0.3 : 0.55,
        market: -0.03 * (0.5 + sev),
      };
    }
    case 'recovery': return { gdp: 5.2, cc: 50, bc: 51, unemp: 8, infl: 4.5, rate: 5.5, funding: 0.85, market: 0.02 };
    default: return { gdp: 6.5, cc: 58, bc: 58, unemp: 7, infl: 5, rate: 6.5, funding: 1, market: 0.009 };
  }
}

export function initialMacro(econ: 'normal' | 'boom' | 'recession'): MacroState {
  const fx: Record<string, number> = {};
  for (const c of Object.values(COUNTRIES)) fx[c.currency] = c.fxBase;
  const m: MacroState = {
    phase: econ === 'boom' ? 'boom' : econ === 'recession' ? 'recession' : 'expansion',
    phaseMonths: 0,
    phaseLength: econ === 'normal' ? 24 : 10,
    gdpGrowth: 6.5,
    inflation: 5,
    interestRate: 6.5,
    unemployment: 7,
    consumerConfidence: 58,
    businessConfidence: 58,
    fx: { ...fx },
    fxBase: { ...fx },
    priceLevel: 1,
    marketIndex: 1000,
    fundingClimate: 1,
    recessionKind: econ === 'recession' ? 'demand' : null,
    severity: econ === 'recession' ? 0.6 : 0.3,
    recessionsSurvived: 0,
  };
  if (econ !== 'normal') {
    const t = targets(m);
    m.gdpGrowth = t.gdp; m.consumerConfidence = t.cc; m.businessConfidence = t.bc; m.unemployment = t.unemp;
    m.inflation = t.infl; m.interestRate = t.rate; m.fundingClimate = t.funding;
  }
  return m;
}

const NEXT: Record<MacroPhase, [MacroPhase, number][]> = {
  expansion: [['boom', 0.45], ['slowdown', 0.55]],
  boom: [['slowdown', 1]],
  slowdown: [['recession', 0.5], ['expansion', 0.5]],
  recession: [['recovery', 1]],
  recovery: [['expansion', 1]],
};

const LENGTH: Record<MacroPhase, [number, number]> = {
  expansion: [16, 40], boom: [6, 14], slowdown: [5, 12], recession: [6, 18], recovery: [6, 12],
};

export function startRecession(s: SimState, kind: RecessionKind, severity: number, months?: number): void {
  const m = s.macro;
  m.phase = 'recession';
  m.phaseMonths = 0;
  m.phaseLength = months ?? randInt(s, LENGTH.recession[0], LENGTH.recession[1]);
  m.recessionKind = kind;
  m.severity = clamp(severity, 0.1, 1);
  const what = kind === 'financial' ? 'A credit crunch hits: lenders pull back and funding dries up.' : kind === 'supply' ? 'Supply shocks drive prices up and squeeze margins.' : 'Consumers and businesses cut spending sharply.';
  addNews(s, 'Economy enters recession', `${what} Severity ${(m.severity * 100).toFixed(0)}%.`, 'macro', 'negative');
}

function transition(s: SimState): void {
  const m = s.macro;
  const options = NEXT[m.phase];
  let r = randRange(s, 0, 1);
  let next: MacroPhase = options[0][0];
  for (const [ph, p] of options) {
    if (r < p) { next = ph; break; }
    r -= p;
  }
  const prev = m.phase;
  if (next === 'recession') {
    startRecession(s, pick(s, ['demand', 'financial', 'supply'] as RecessionKind[]), randRange(s, 0.25, 1));
    return;
  }
  m.phase = next;
  m.phaseMonths = 0;
  m.phaseLength = randInt(s, LENGTH[next][0], LENGTH[next][1]);
  if (prev === 'recession') {
    m.recessionsSurvived += 1;
    m.recessionKind = null;
  }
  if (next === 'boom') m.severity = randRange(s, 0.3, 1);
  const headline: Record<MacroPhase, [string, string, 'positive' | 'negative' | 'neutral']> = {
    boom: ['Economy booms as demand surges', 'Spending and investment are strong. Hiring gets harder as everyone expands.', 'positive'],
    slowdown: ['Growth slows across the economy', 'Confidence is softening. Watch your burn.', 'negative'],
    recovery: ['Recession ends; recovery begins', 'Confidence is returning, slowly.', 'positive'],
    expansion: ['Steady growth returns', 'The economy settles into a healthy expansion.', 'positive'],
    recession: ['', '', 'negative'],
  };
  const [h, b, sent] = headline[next];
  addNews(s, h, b, 'macro', sent);
}

export function monthlyMacro(s: SimState): void {
  const m = s.macro;
  m.phaseMonths += 1;
  if (m.phaseMonths >= m.phaseLength) transition(s);
  const t = targets(m);
  const prevCC = m.consumerConfidence;
  const k = 0.22;
  m.gdpGrowth = approach(m.gdpGrowth, t.gdp, k) + randNormal(s, 0, 0.25);
  m.consumerConfidence = clamp(approach(m.consumerConfidence, t.cc, k) + randNormal(s, 0, 1.6), 5, 95);
  m.businessConfidence = clamp(approach(m.businessConfidence, t.bc, k) + randNormal(s, 0, 1.6), 5, 95);
  m.unemployment = clamp(approach(m.unemployment, t.unemp, k * 0.7) + randNormal(s, 0, 0.1), 2, 20);
  m.inflation = clamp(approach(m.inflation, t.infl, k) + randNormal(s, 0, 0.2), -2, 20);
  m.interestRate = clamp(approach(m.interestRate, t.rate, 0.15) + randNormal(s, 0, 0.05), 1, 15);
  m.fundingClimate = clamp(approach(m.fundingClimate, t.funding, 0.25) + randNormal(s, 0, 0.03), 0.2, 1.8);
  m.priceLevel *= 1 + m.inflation / 1200;
  m.marketIndex = Math.max(100, m.marketIndex * (1 + t.market + randNormal(s, 0, 0.035)));
  // FX: mean-reverting random walk; the rupee weakens in downturns and when inflation runs hot.
  for (const c of Object.values(COUNTRIES)) {
    if (c.currency === 'INR') continue;
    const base = m.fxBase[c.currency];
    const cur = m.fx[c.currency];
    const drift = (m.phase === 'recession' ? 0.004 : 0) + (m.inflation - 4) / 1200;
    const next = cur * Math.exp(randNormal(s, drift, c.fxVol));
    m.fx[c.currency] = approach(next, base * Math.pow(m.priceLevel, 0.4), 0.02);
  }
  if (m.consumerConfidence - prevCC < -6) addNews(s, 'Consumer confidence falls sharply', `The index dropped to ${m.consumerConfidence.toFixed(0)}. Discretionary spending is at risk.`, 'macro', 'negative');
  else if (m.consumerConfidence - prevCC > 6) addNews(s, 'Consumer confidence jumps', `The index rose to ${m.consumerConfidence.toFixed(0)}.`, 'macro', 'positive');
  if (chance(s, 0.04)) {
    const dir = randNormal(s, 0, 1) > 0 ? 1 : -1;
    m.interestRate = clamp(m.interestRate + dir * 0.25, 1, 15);
    addNews(s, dir > 0 ? 'Central bank raises rates' : 'Central bank cuts rates', `Policy rate now ${m.interestRate.toFixed(2)}%. Borrowing costs ${dir > 0 ? 'rise' : 'fall'}.`, 'macro', dir > 0 ? 'negative' : 'positive');
  }
}

/** Effective investor appetite including event modifiers. */
export function fundingClimate(s: SimState): number {
  return s.macro.fundingClimate * modifier(s, 'funding');
}

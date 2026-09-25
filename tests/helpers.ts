import { createGame, defaultConfig } from '../src/engine/create';
import type { GameConfig, SimState } from '../src/engine/types';
import { resolveDecision } from '../src/engine/systems/decisions';

/** A fresh game with the first product launched using the given strategy. */
export function launchedGame(overrides: Partial<GameConfig> = {}, strategy = 'balanced'): SimState {
  const s = createGame(defaultConfig({ tutorial: false, ...overrides }));
  const d = s.decisions.find((x) => x.kind === 'launch_strategy');
  if (d) resolveDecision(s, d.id, strategy);
  return s;
}

export function sumValues(r: Record<string, number>): number {
  return Object.values(r).reduce((a, b) => a + b, 0);
}

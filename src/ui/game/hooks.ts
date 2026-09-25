import { useSyncExternalStore } from 'react';
import { game } from './controller';
import type { SimState } from '../../engine/types';

/** Re-render whenever the simulation changes. */
export function useGameVersion(): number {
  return useSyncExternalStore(game.subscribe, game.getVersion, game.getVersion);
}

/** The live simulation state (non-null inside the game shell). */
export function useSim(): SimState {
  useGameVersion();
  if (!game.state) throw new Error('No active game');
  return game.state;
}

export function useLastReport() {
  const s = useSim();
  return s.reports[s.reports.length - 1] ?? null;
}

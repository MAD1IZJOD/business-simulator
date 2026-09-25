// Runs forecasts and what-if comparisons off the main thread.
import { comparePlans, forecast } from '../../engine/projection';
import type { WhatIfAction } from '../../engine/projection';
import type { SimState } from '../../engine/types';

export type WorkerRequest =
  | { id: number; kind: 'forecast'; state: SimState; months: number; runs: number }
  | { id: number; kind: 'compare'; state: SimState; planA: WhatIfAction[]; planB: WhatIfAction[]; months: number; runs: number };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  try {
    const result = req.kind === 'forecast'
      ? forecast(req.state, req.months, req.runs)
      : comparePlans(req.state, req.planA, req.planB, req.months, req.runs);
    self.postMessage({ id: req.id, ok: true, result });
  } catch (err) {
    self.postMessage({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};

import type { Decision, DecisionOption, SimState } from '../types';
import { uid } from '../util';

export interface DecisionSpec {
  kind: string;
  category: Decision['category'];
  title: string;
  description: string;
  days: number;
  options: DecisionOption[];
  defaultOption: string;
  data: Record<string, unknown>;
}

export function createDecision(s: SimState, spec: DecisionSpec): Decision {
  const d: Decision = {
    id: uid(s, 'd'),
    kind: spec.kind,
    category: spec.category,
    title: spec.title,
    description: spec.description,
    createdDay: s.day,
    expiresDay: s.day + spec.days,
    options: spec.options,
    defaultOption: spec.defaultOption,
    data: spec.data,
    resolved: false,
    chosen: null,
    outcome: null,
  };
  s.decisions.unshift(d);
  return d;
}

export function openDecisions(s: SimState): Decision[] {
  return s.decisions.filter((d) => !d.resolved);
}

export function hasOpenDecision(s: SimState, kind: string, key?: (d: Decision) => boolean): boolean {
  return s.decisions.some((d) => !d.resolved && d.kind === kind && (!key || key(d)));
}

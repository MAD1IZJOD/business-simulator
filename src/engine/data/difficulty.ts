import type { Difficulty } from '../types';

export interface DifficultyDef {
  id: Difficulty;
  name: string;
  description: string;
  demandMult: number;
  competitorAggression: number;
  negativeEventMult: number;
  eventSeverity: number;
  financingEase: number;
  overdraftMonths: number; // overdraft facility as months of fixed costs
  insolvencyGraceMonths: number;
  covenants: boolean;
  boardStrictness: number;
  costMult: number;
  churnMult: number;
  founderCanBeOusted: boolean;
  suggestedCapital: number;
}

export const DIFFICULTIES: Record<Difficulty, DifficultyDef> = {
  sandbox: { id: 'sandbox', name: 'Sandbox', description: 'Deep pockets and forgiving markets. Experiment freely.', demandMult: 1.3, competitorAggression: 0.5, negativeEventMult: 0.4, eventSeverity: 0.5, financingEase: 1.5, overdraftMonths: 6, insolvencyGraceMonths: 6, covenants: false, boardStrictness: 0.4, costMult: 0.9, churnMult: 0.85, founderCanBeOusted: false, suggestedCapital: 100000000 },
  easy: { id: 'easy', name: 'Easy', description: 'A normal business with forgiving consequences.', demandMult: 1.15, competitorAggression: 0.75, negativeEventMult: 0.7, eventSeverity: 0.75, financingEase: 1.25, overdraftMonths: 3, insolvencyGraceMonths: 3, covenants: false, boardStrictness: 0.7, costMult: 0.95, churnMult: 0.92, founderCanBeOusted: false, suggestedCapital: 20000000 },
  normal: { id: 'normal', name: 'Normal', description: 'Balanced. Good decisions are rewarded, bad ones hurt.', demandMult: 1, competitorAggression: 1, negativeEventMult: 1, eventSeverity: 1, financingEase: 1, overdraftMonths: 1, insolvencyGraceMonths: 2, covenants: false, boardStrictness: 1, costMult: 1, churnMult: 1, founderCanBeOusted: false, suggestedCapital: 5000000 },
  hard: { id: 'hard', name: 'Hard', description: 'Tight finances, aggressive competitors, debt covenants.', demandMult: 0.9, competitorAggression: 1.25, negativeEventMult: 1.25, eventSeverity: 1.2, financingEase: 0.8, overdraftMonths: 0.5, insolvencyGraceMonths: 1, covenants: true, boardStrictness: 1.25, costMult: 1.05, churnMult: 1.08, founderCanBeOusted: false, suggestedCapital: 2500000 },
  brutal: { id: 'brutal', name: 'Brutal', description: 'Mistakes kill the company. No overdraft, strict covenants, a board that will fire you.', demandMult: 0.8, competitorAggression: 1.5, negativeEventMult: 1.5, eventSeverity: 1.5, financingEase: 0.65, overdraftMonths: 0, insolvencyGraceMonths: 0, covenants: true, boardStrictness: 1.5, costMult: 1.1, churnMult: 1.15, founderCanBeOusted: true, suggestedCapital: 1000000 },
};

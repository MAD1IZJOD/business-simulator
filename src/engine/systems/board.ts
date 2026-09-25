// The board: members with priorities judge performance each month. Confidence
// gates approval of major actions (when approvals are required) and, on Brutal,
// sustained low confidence can cost the founder their job.
import type { BoardMember, BoardState, SimState } from '../types';
import { difficultyOf, founderOwnership } from '../context';
import { chance } from '../rng';
import { approach, clamp, uid } from '../util';
import { annualizedGrowth } from './valuation';
import { averageMorale } from './employees';
import { addNews } from './news';

export function initialBoard(s: SimState, founderName: string): BoardState {
  return {
    members: [{ id: uid(s, 'b'), name: founderName, kind: 'founder', priority: 'growth', satisfaction: 80 }],
    confidence: 70,
    lowConfidenceMonths: 0,
    expectations: null,
    approvalsRequired: false,
    lastMeetingNote: 'The board is just you for now.',
  };
}

function memberScore(s: SimState, m: BoardMember): number {
  const r = s.reports[s.reports.length - 1];
  const growth = annualizedGrowth(s);
  const expected = s.board.expectations?.growth ?? 0.5;
  const margin = r && r.income.netRevenue > 0 ? r.income.ebitda / r.income.netRevenue : -0.5;
  const runway = r ? r.kpis.runwayMonths : 24;
  switch (m.priority) {
    case 'growth': return clamp(50 + (growth - expected) * 40, 0, 100);
    case 'profitability': return clamp(55 + margin * 80, 0, 100);
    case 'risk': return clamp(runway >= 18 ? 80 : runway * 4, 0, 100);
    case 'employees': return clamp(averageMorale(s), 0, 100);
    case 'market_share': return clamp(40 + s.metrics.marketShare * 200, 0, 100);
  }
}

export function monthlyBoard(s: SimState): void {
  const b = s.board;
  const strict = difficultyOf(s).boardStrictness;
  let sum = 0;
  let w = 0;
  for (const m of b.members) {
    const score = memberScore(s, m);
    m.satisfaction = clamp(approach(m.satisfaction, 50 + (score - 50) / strict, 0.35), 0, 100);
    const weight = m.kind === 'investor' ? 1.5 : 1;
    sum += m.satisfaction * weight;
    w += weight;
  }
  b.confidence = w > 0 ? sum / w : 70;
  const worst = [...b.members].sort((a, c) => a.satisfaction - c.satisfaction)[0];
  b.lastMeetingNote = b.members.length <= 1
    ? 'No outside board members yet.'
    : b.confidence > 65 ? 'The board is pleased with progress.'
    : b.confidence > 40 ? `Mixed reviews. ${worst.name} wants better ${worst.priority.replace('_', ' ')}.`
    : `The board is losing patience. ${worst.name} is pushing hard on ${worst.priority.replace('_', ' ')}.`;
  if (b.confidence < 25 && b.members.length > 1) b.lowConfidenceMonths += 1;
  else b.lowConfidenceMonths = Math.max(0, b.lowConfidenceMonths - 1);
}

/** Should the founder be removed? Only on difficulties that allow it and when investors control the company. */
export function founderOusted(s: SimState): boolean {
  return difficultyOf(s).founderCanBeOusted && s.board.lowConfidenceMonths >= 4 && founderOwnership(s) < 0.5;
}

/** Board approval for a major action. Returns [approved, reason]. */
export function boardApproves(s: SimState, action: string): [boolean, string] {
  const b = s.board;
  if (!b.approvalsRequired || b.members.length <= 1) return [true, 'No board approval needed.'];
  if (founderOwnership(s) > 0.5 && s.config.difficulty !== 'brutal') return [true, 'You control the board.'];
  const p = clamp((b.confidence - 20) / 50, 0.05, 0.97);
  if (chance(s, p)) return [true, `The board approved the ${action}.`];
  addNews(s, `Board blocks ${s.company.name}'s ${action}`, `Board confidence is ${b.confidence.toFixed(0)}/100.`, 'company', 'negative');
  return [false, `The board rejected the ${action} (confidence ${b.confidence.toFixed(0)}/100). Improve performance and try again.`];
}

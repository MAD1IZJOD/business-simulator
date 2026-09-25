import type { RoundKind } from '../types';

export interface InvestorDef {
  id: string;
  name: string;
  kind: 'friends' | 'angel' | 'vc' | 'growth' | 'impact' | 'strategic';
  stages: RoundKind[];
  preference: 'growth' | 'profitability' | 'market_share' | 'technology' | 'social_impact';
  checkMin: number;
  checkMax: number;
  boardSeat: boolean;
  description: string;
}

export const INVESTORS: InvestorDef[] = [
  { id: 'ff', name: 'Family & friends', kind: 'friends', stages: ['friends_family'], preference: 'growth', checkMin: 500000, checkMax: 5000000, boardSeat: false, description: 'People who believe in you. Small cheques, patient money.' },
  { id: 'angel_network', name: 'Indus Angel Network', kind: 'angel', stages: ['angel', 'seed'], preference: 'growth', checkMin: 2500000, checkMax: 20000000, boardSeat: false, description: 'Operator angels. Care about the founder and early traction.' },
  { id: 'kiran_angel', name: 'Kiran Rao (angel)', kind: 'angel', stages: ['angel', 'friends_family'], preference: 'technology', checkMin: 1000000, checkMax: 7500000, boardSeat: false, description: 'Ex-CTO angel. Backs strong products and technical depth.' },
  { id: 'lotus_seed', name: 'Lotus Seed Fund', kind: 'vc', stages: ['seed', 'series_a'], preference: 'growth', checkMin: 20000000, checkMax: 120000000, boardSeat: true, description: 'Seed specialist. Wants fast month-on-month growth.' },
  { id: 'banyan', name: 'Banyan Ventures', kind: 'vc', stages: ['series_a', 'series_b'], preference: 'market_share', checkMin: 150000000, checkMax: 800000000, boardSeat: true, description: 'Backs category leaders. Obsessed with market share.' },
  { id: 'deccan', name: 'Deccan Capital', kind: 'vc', stages: ['seed', 'series_a', 'series_b'], preference: 'technology', checkMin: 50000000, checkMax: 600000000, boardSeat: true, description: 'Deep-tech VC. Values IP, R&D and product quality.' },
  { id: 'meridian_growth', name: 'Meridian Growth Partners', kind: 'growth', stages: ['series_b', 'series_c', 'growth'], preference: 'profitability', checkMin: 500000000, checkMax: 5000000000, boardSeat: true, description: 'Growth equity. Wants efficient growth and a path to profit.' },
  { id: 'horizon', name: 'Horizon Global', kind: 'growth', stages: ['series_c', 'growth'], preference: 'growth', checkMin: 1500000000, checkMax: 10000000000, boardSeat: true, description: 'Global crossover fund. Pays up for growth, punishes misses.' },
  { id: 'aarambh', name: 'Aarambh Impact', kind: 'impact', stages: ['seed', 'series_a', 'series_b'], preference: 'social_impact', checkMin: 20000000, checkMax: 400000000, boardSeat: false, description: 'Impact investor. Rewards ESG, employee welfare and community impact.' },
  { id: 'strategic_corp', name: 'Tatva Corporate Ventures', kind: 'strategic', stages: ['series_a', 'series_b', 'series_c'], preference: 'market_share', checkMin: 100000000, checkMax: 1500000000, boardSeat: false, description: 'Corporate VC. Brings distribution; wants strategic alignment.' },
];

export interface RoundDef {
  kind: RoundKind;
  name: string;
  typicalSize: [number, number];
  minRunRate: number; // annualised revenue needed (INR)
  requiresLaunch: boolean;
  months: number;
  expectedGrowth: number; // annual growth investors expect afterwards
}

export const ROUNDS: RoundDef[] = [
  { kind: 'friends_family', name: 'Friends & family', typicalSize: [500000, 5000000], minRunRate: 0, requiresLaunch: false, months: 1, expectedGrowth: 0 },
  { kind: 'angel', name: 'Angel', typicalSize: [2500000, 25000000], minRunRate: 0, requiresLaunch: false, months: 1.5, expectedGrowth: 1 },
  { kind: 'seed', name: 'Seed', typicalSize: [20000000, 150000000], minRunRate: 1000000, requiresLaunch: true, months: 2, expectedGrowth: 2 },
  { kind: 'series_a', name: 'Series A', typicalSize: [150000000, 800000000], minRunRate: 30000000, requiresLaunch: true, months: 2.5, expectedGrowth: 1.5 },
  { kind: 'series_b', name: 'Series B', typicalSize: [500000000, 3000000000], minRunRate: 150000000, requiresLaunch: true, months: 3, expectedGrowth: 1 },
  { kind: 'series_c', name: 'Series C', typicalSize: [1500000000, 8000000000], minRunRate: 500000000, requiresLaunch: true, months: 3, expectedGrowth: 0.7 },
  { kind: 'growth', name: 'Growth equity', typicalSize: [3000000000, 20000000000], minRunRate: 1500000000, requiresLaunch: true, months: 3, expectedGrowth: 0.4 },
];

export const ROUND_BY_KIND = Object.fromEntries(ROUNDS.map((r) => [r.kind, r])) as Record<RoundKind, RoundDef>;

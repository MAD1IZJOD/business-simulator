import type { SimState } from '../types';

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  check: (s: SimState) => boolean;
}

const last = (s: SimState) => s.reports[s.reports.length - 1];
const cumulativeRevenue = (s: SimState) => s.reports.reduce((a, r) => a + r.income.netRevenue, 0);

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_sale', name: 'First sale', description: 'Earn your first rupee of revenue.', check: (s) => cumulativeRevenue(s) > 0 },
  { id: 'lakh', name: 'First ₹1 lakh', description: 'Reach ₹1 lakh in cumulative revenue.', check: (s) => cumulativeRevenue(s) >= 1e5 },
  { id: 'crore', name: 'First ₹1 crore', description: 'Reach ₹1 crore in cumulative revenue.', check: (s) => cumulativeRevenue(s) >= 1e7 },
  { id: 'profitable_month', name: 'In the black', description: 'Have your first profitable month.', check: (s) => (last(s)?.income.netIncome ?? 0) > 0 },
  { id: 'customers_1000', name: '1,000 customers', description: 'Serve 1,000 paying customers.', check: (s) => (last(s)?.kpis.customers ?? 0) >= 1000 },
  { id: 'customers_100k', name: '100,000 customers', description: 'Serve 100,000 paying customers.', check: (s) => (last(s)?.kpis.customers ?? 0) >= 100000 },
  { id: 'team_10', name: 'Real team', description: 'Grow to 10 employees.', check: (s) => s.employees.length >= 10 },
  { id: 'team_100', name: '100 employees', description: 'Grow to 100 employees.', check: (s) => s.employees.length >= 100 },
  { id: 'international', name: 'Going global', description: 'Enter a market outside your home country.', check: (s) => Boolean(s.flags.international) },
  { id: 'first_acquisition', name: 'Acquirer', description: 'Complete your first acquisition.', check: (s) => Number(s.flags.acquisitions ?? 0) >= 1 },
  { id: 'raised_seed', name: 'Venture-backed', description: 'Close a seed round or later.', check: (s) => s.rounds.some((r) => ['seed', 'series_a', 'series_b', 'series_c', 'growth'].includes(r.kind)) },
  { id: 'ipo', name: 'Ring the bell', description: 'Take the company public.', check: (s) => s.company.isPublic },
  { id: 'valuation_100cr', name: '₹100 crore valuation', description: 'Reach a ₹100 crore valuation.', check: (s) => s.metrics.valuation >= 1e9 },
  { id: 'unicorn', name: 'Unicorn', description: 'Reach a ₹8,300 crore (~$1B) valuation.', check: (s) => s.metrics.valuation >= 8.3e10 },
  { id: 'survive_recession', name: 'Weathered the storm', description: 'Survive a full recession.', check: (s) => s.macro.recessionsSurvived >= 1 && s.reports.length > 3 },
  { id: 'market_leader', name: 'Market leader', description: 'Hold 30% market share.', check: (s) => s.metrics.marketShare >= 0.3 },
  { id: 'patent', name: 'Inventor', description: 'Have a patent granted.', check: (s) => s.products.some((p) => p.patent?.status === 'granted') },
  { id: 'five_years', name: 'Five-year company', description: 'Operate for 60 months.', check: (s) => s.reports.length >= 60 },
  { id: 'debt_free', name: 'Debt free', description: 'Repay a loan in full.', check: (s) => s.loans.some((l) => l.status === 'repaid') },
  { id: 'happy_team', name: 'Great place to work', description: 'Average morale above 80 with 20+ employees.', check: (s) => s.employees.length >= 20 && (last(s)?.kpis.morale ?? 0) > 80 },
];

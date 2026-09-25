// Company valuation from fundamentals: revenue run-rate × an industry multiple
// adjusted for growth, margins, funding climate, brand and product-market fit,
// floored by net assets and (pre-revenue) by team, product and IP.
import type { DriverFactor, SimState } from '../types';
import { industryOf, launchedProducts, roleCapacity, totalShares } from '../context';
import { clamp } from '../util';
import { fundingClimate } from './macro';

export interface ValuationResult {
  value: number;
  runRate: number;
  multiple: number;
  growth: number;
  margin: number;
  floor: number;
  drivers: DriverFactor[];
}

export function annualizedGrowth(s: SimState): number {
  const r = s.reports;
  if (r.length < 2) return 0;
  const n = Math.min(3, r.length - 1);
  const a = r[r.length - 1].income.netRevenue;
  const b = r[r.length - 1 - n].income.netRevenue;
  if (b <= 0) return a > 0 ? 2 : 0;
  const monthly = Math.pow(Math.max(0.01, a / b), 1 / n) - 1;
  return clamp(Math.pow(1 + monthly, 12) - 1, -0.9, 3);
}

export function computeValuation(s: SimState, useMarketPrice = true): ValuationResult {
  const ind = industryOf(s);
  const r = s.reports.slice(-3);
  const monthly = r.length ? r.reduce((a, x) => a + x.income.netRevenue, 0) / r.length : 0;
  const runRate = monthly * 12;
  const ebitda = r.length ? r.reduce((a, x) => a + x.income.ebitda, 0) / r.length : 0;
  const margin = monthly > 0 ? clamp(ebitda / monthly, -2, 0.6) : 0;
  const growth = annualizedGrowth(s);
  // Growth from a tiny base is noisy: it only counts fully once revenue has scale (≈ ₹5 Cr run-rate).
  const scaleConfidence = clamp(runRate / 50000000, 0.15, 1);
  const growthF = clamp(1 + 0.6 * growth * scaleConfidence, 0.4, 3);
  const marginF = clamp(1 + margin * 0.8, 0.45, 1.5);
  const macroF = clamp(Math.pow(fundingClimate(s), 0.6) * (1 - (s.macro.interestRate - 6.5) / 30), 0.3, 1.6);
  const brandF = 0.85 + 0.3 * (s.company.brand / 100);
  const pmfF = 0.8 + 0.4 * (s.company.pmf / 100);
  const multiple = ind.multiple * growthF * marginF * macroF * brandF * pmfF;
  const revenueValue = runRate * multiple;
  // Floors: net assets; pre-revenue value of team, product and IP.
  const book = Math.max(0, s.finance.paidInCapital + s.finance.retainedEarnings - s.finance.treasuryStock);
  const eng = roleCapacity(s, 'engineer') + roleCapacity(s, 'researcher');
  const products = launchedProducts(s);
  const bestQ = Math.max(0, ...s.products.map((p) => p.quality));
  const patents = s.products.filter((p) => p.patent?.status === 'granted').length;
  const teamValue = eng * 1500000 + bestQ * 60000 * (products.length ? 1.5 : 1) + patents * 5000000;
  const lastRound = s.rounds[s.rounds.length - 1];
  const anchor = lastRound ? lastRound.postMoney * Math.pow(0.97, (s.day - lastRound.day) / 30) : 0;
  const floor = Math.max(book, teamValue * macroF);
  let value = Math.max(revenueValue, floor);
  // Private valuations are sticky around the last priced round for a while.
  if (anchor > 0 && !s.company.isPublic) value = value * 0.6 + Math.max(value, anchor * 0.8) * 0.4;
  if (useMarketPrice && s.company.isPublic && s.stock) value = s.stock.price * totalShares(s);
  const drivers: DriverFactor[] = [
    { label: 'Revenue run-rate', value: runRate, detail: `₹${Math.round(runRate).toLocaleString('en-IN')} annualised` },
    { label: `Industry multiple (${ind.name})`, value: ind.multiple },
    { label: 'Growth adjustment', value: growthF, detail: `${(growth * 100).toFixed(0)}% annualised growth` },
    { label: 'Margin adjustment', value: marginF, detail: `${(margin * 100).toFixed(0)}% EBITDA margin` },
    { label: 'Funding climate & rates', value: macroF },
    { label: 'Brand', value: brandF },
    { label: 'Product-market fit', value: pmfF },
    { label: 'Asset / team floor', value: floor },
  ];
  return { value: Math.max(0, value), runRate, multiple, growth, margin, floor, drivers };
}

export function pricePerShare(s: SimState): number {
  const t = totalShares(s);
  return t > 0 ? s.metrics.valuation / t : 0;
}

// Slow-moving intangibles: brand, reputation, culture, ESG and product-market fit.
// Each moves gradually toward a target computed from real drivers.
import { MANAGEMENT_STYLES } from '../data/roles';
import type { SimState } from '../types';
import { industryOf, launchedProducts } from '../context';
import { approach, clamp, saturate } from '../util';
import { payExpense } from './ledger';
import { brandInvestment } from './marketing';
import { averageMorale } from './employees';

function avg(xs: number[], fallback: number): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : fallback;
}

export function brandDrivers(s: SimState): { label: string; value: number }[] {
  const products = launchedProducts(s);
  const sat = avg(products.map((p) => p.satisfaction), 50);
  const q = avg(products.map((p) => p.quality), 45);
  const ageMonths = s.day / 30.4;
  return [
    { label: 'Brand-building marketing', value: brandInvestment(s) },
    { label: 'Customer satisfaction', value: (sat - 50) * 0.3 },
    { label: 'Product quality', value: (q - 50) * 0.15 },
    { label: 'Reviews', value: (s.company.reviewRating - 3.4) * 8 },
    { label: 'Company track record', value: Math.min(8, ageMonths / 6) },
    { label: 'ESG', value: (s.esg.score - 50) * 0.05 },
    { label: 'Market presence', value: Math.min(6, s.markets.filter((m) => m.entered).length * 1.2) },
  ];
}

export function monthlyReputation(s: SimState): void {
  const c = s.company;
  // Brand: 30 baseline plus drivers, moving 6%/month.
  const drivers = brandDrivers(s);
  const target = clamp(28 + drivers.reduce((a, d) => a + d.value, 0), 0, 100);
  c.brand = clamp(approach(c.brand, target, 0.06), 0, 100);
  for (const d of drivers) s.month.drv[`brand.${d.label}`] = d.value;
  s.month.drv['brand.__target'] = target;

  const products = launchedProducts(s);
  const sat = avg(products.map((p) => p.satisfaction), 55);
  c.reputation.customer = clamp(approach(c.reputation.customer, sat * 0.7 + c.reviewRating * 6, 0.15), 0, 100);
  const morale = averageMorale(s) || 60;
  c.reputation.employer = clamp(approach(c.reputation.employer, morale * 0.75 + 12 - c.layoffShock * 30, 0.12), 0, 100);
  const growthOk = s.board.expectations ? (s.reports.length >= 4 ? 1 : 0) : 0;
  c.reputation.investor = clamp(approach(c.reputation.investor, 50 + growthOk * 5 + (c.brand - 50) * 0.2 + s.board.confidence * 0.1 - 5, 0.08), 0, 100);
  const ind = industryOf(s);
  const lawyers = s.employees.filter((e) => e.role === 'lawyer').length;
  const openReg = s.legalCases.filter((l) => l.status === 'open' && l.kind === 'regulatory').length;
  const regTarget = 72 + Math.min(15, lawyers * 5) - ind.regulation * (lawyers ? 5 : 25) - openReg * 10 - (s.security.lastIncidentDay !== null && s.day - s.security.lastIncidentDay < 180 ? 10 : 0);
  c.reputation.regulatory = clamp(approach(c.reputation.regulatory, regTarget, 0.1), 0, 100);

  // Culture drifts 3%/month toward the management style's profile, with pressures.
  const style = MANAGEMENT_STYLES[c.managementStyle].culture;
  const research = s.employees.filter((e) => e.dept === 'research' || e.dept === 'engineering').length / Math.max(1, s.employees.length);
  const cul = c.culture;
  cul.innovation = approach(cul.innovation, (style.innovation ?? 50) + research * 20, 0.03);
  cul.discipline = approach(cul.discipline, style.discipline ?? 50, 0.03);
  cul.collaboration = approach(cul.collaboration, (style.collaboration ?? 50) - (c.remotePolicy === 'remote' ? 12 : c.remotePolicy === 'hybrid' ? 4 : 0) - c.layoffShock * 25, 0.03);
  cul.riskTolerance = approach(cul.riskTolerance, style.riskTolerance ?? 50, 0.03);
  cul.executionSpeed = approach(cul.executionSpeed, (style.executionSpeed ?? 50) - Math.max(0, Math.log10(Math.max(1, s.employees.length)) - 1.5) * 8, 0.03);
  cul.satisfaction = approach(cul.satisfaction, morale, 0.1);
}

export function monthlyEsg(s: SimState): void {
  const e = s.esg;
  const ind = industryOf(s);
  const spend = e.sustainabilityBudget + e.communityBudget + e.welfareBudget;
  if (spend > 0) payExpense(s, 'esg', spend, 'ESG programs');
  const green = s.research.unlocked.includes('green_ops') ? 0.5 : 1;
  const units = s.month.units + s.month.produced;
  e.emissions = (units * ind.emissionsPerUnit * green * (1 - 0.4 * saturate(e.sustainabilityBudget, 500000))) / 1000 + s.employees.length * 0.3;
  const revenue = Math.max(1, s.month.revenue);
  const intensity = (e.emissions / revenue) * 1e6; // tonnes per ₹10 lakh
  const target = clamp(55 - Math.min(30, intensity * 2) + saturate(e.sustainabilityBudget, 500000) * 15 + saturate(e.communityBudget, 300000) * 10 + saturate(e.welfareBudget, 300000) * 8 + (averageMorale(s) - 55) * 0.2, 0, 100);
  e.score = clamp(approach(e.score, target, 0.1), 0, 100);
}

/** Product-market fit from retention, satisfaction, organic growth, referrals, usage and willingness to pay. */
export function pmfComponents(s: SimState): { label: string; value: number }[] {
  const ind = industryOf(s);
  const m = s.month;
  const churn = m.churnBase > 0 ? m.churned / m.churnBase : ind.baseChurn;
  const retention = clamp(100 * (1 - churn / (ind.baseChurn * 2)), 0, 100);
  const products = launchedProducts(s);
  const sat = avg(products.map((p) => p.satisfaction), 0);
  const total = m.newCustomers || 1;
  const organic = ((m.newByChannel.word_of_mouth ?? 0) + (m.newByChannel.organic ?? 0) + (m.newByChannel.seo ?? 0) + (m.newByChannel.content ?? 0)) / total;
  const referral = clamp((m.funnel.referral / Math.max(1, m.funnel.consideration)) * 250, 0, 100);
  const usage = m.funnel.purchase > 0 ? clamp((m.funnel.activation / m.funnel.purchase) * 100, 0, 100) : 0;
  const wtp = clamp(50 + (1 - churn / ind.baseChurn) * 25 + (s.company.brand - 50) * 0.3, 0, 100);
  return [
    { label: 'Retention', value: retention },
    { label: 'Satisfaction', value: sat },
    { label: 'Organic growth', value: clamp(organic * 100, 0, 100) },
    { label: 'Referrals', value: referral },
    { label: 'Usage / activation', value: usage },
    { label: 'Willingness to pay', value: wtp },
  ];
}

export function updatePmf(s: SimState): void {
  if (!launchedProducts(s).length) { s.company.pmf = 0; return; }
  const comps = pmfComponents(s);
  const w = [0.3, 0.2, 0.15, 0.1, 0.1, 0.15];
  const v = comps.reduce((a, c, i) => a + c.value * w[i], 0);
  s.company.pmf = clamp(approach(s.company.pmf, v, 0.4), 0, 100);
  for (const c of comps) s.month.drv[`pmf.${c.label}`] = c.value;
}

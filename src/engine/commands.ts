// Player commands: the only way the UI changes simulation state. Every command
// validates its inputs and returns a human-readable result.
import { CHANNELS } from './data/channels';
import { MONETIZATIONS, GTM } from './data/businessModels';
import type {
  Audience, DeptId, DevSpeed, Experiment, GtmChannel, LoanKind, ManagementStyle, MarketingChannelId, Monetization,
  Objective, Positioning, RemotePolicy, RoleId, RoundKind, SimState, TechTrack,
} from './types';
import { industryOf, physical } from './context';
import { clamp } from './util';
import { moveCash, payExpense, recordOpex } from './systems/ledger';
import { effortFor, launchProduct, newProduct } from './systems/products';
import { emptyInventory, takeFinished } from './systems/inventory';
import * as hiring from './systems/hiring';
import * as people from './systems/employees';
import * as suppliers from './systems/suppliers';
import * as mfg from './systems/manufacturing';
import * as fac from './systems/facilities';
import * as expansion from './systems/expansion';
import * as loans from './systems/loans';
import * as capital from './systems/capital';
import * as stock from './systems/stock';
import * as ma from './systems/ma';
import * as tech from './systems/tech';
import * as growth from './systems/growth';
import { resolveDecision } from './systems/decisions';
import { computeValuation } from './systems/valuation';


export interface CommandResult {
  ok: boolean;
  message: string;
}

const ok = (message: string): CommandResult => ({ ok: true, message });
const fail = (message: string): CommandResult => ({ ok: false, message });
const finite = (v: number) => typeof v === 'number' && Number.isFinite(v);

function running(s: SimState): CommandResult | null {
  return s.status === 'running' ? null : fail('The game has ended.');
}

function product(s: SimState, id: string) {
  return s.products.find((p) => p.id === id);
}

// ------------------------------------------------------------------ products & pricing

export function setPrice(s: SimState, productId: string, price: number): CommandResult {
  const p = product(s, productId);
  if (!p) return fail('Product not found.');
  if (!finite(price) || price <= 0) return fail('Price must be a positive number.');
  const rt = MONETIZATIONS[p.monetization].revenueType;
  if (rt === 'take_rate' && price > 50) return fail('Take rate cannot exceed 50%.');
  if (rt === 'advertising') return fail('Ad-supported products are free to users — adjust ad load instead.');
  if (Math.abs(price - p.price) < 1e-9) return ok('Price unchanged.');
  const change = price / p.price - 1;
  p.price = price;
  p.priceChangedDay = s.day;
  return ok(`${p.name} price ${change >= 0 ? 'raised' : 'cut'} ${(Math.abs(change) * 100).toFixed(1)}%. ${change > 0.03 && rt !== 'transactional' ? 'Existing subscribers may churn more for ~60 days.' : ''}`.trim());
}

export function setAdLoad(s: SimState, productId: string, load: number): CommandResult {
  const p = product(s, productId);
  if (!p) return fail('Product not found.');
  if (!finite(load)) return fail('Invalid ad load.');
  p.adLoad = clamp(Math.round(load), 1, 10);
  return ok(`Ad load set to ${p.adLoad}/10.`);
}

export function setMarketPriceMult(s: SimState, marketId: string, mult: number): CommandResult {
  const m = s.markets.find((x) => x.id === marketId);
  if (!m) return fail('Market not found.');
  if (!finite(mult) || mult <= 0) return fail('Multiplier must be positive.');
  m.priceMult = clamp(mult, 0.1, 10);
  return ok(`Local price multiplier set to ${m.priceMult.toFixed(2)}×.`);
}

export interface NewProductOptions {
  name: string;
  category: string;
  positioning: Positioning;
  monetization: Monetization;
  qualityTarget: number;
  featureScope: number;
  monthlyBudget: number;
  speed: DevSpeed;
  price?: number;
}

export function startProduct(s: SimState, o: NewProductOptions): CommandResult {
  const r = running(s); if (r) return r;
  const ind = industryOf(s);
  if (!o.name.trim()) return fail('Give the product a name.');
  if (!ind.monetizations.includes(o.monetization)) return fail(`${MONETIZATIONS[o.monetization].name} is not available in ${ind.name}.`);
  if (![o.qualityTarget, o.featureScope, o.monthlyBudget].every(finite) || o.monthlyBudget < 0) return fail('Invalid development plan.');
  if (s.products.filter((p) => p.stage !== 'discontinued').length >= 8) return fail('You can run at most 8 active products.');
  const p = newProduct(s, { ...o, name: o.name.trim(), qualityTarget: clamp(o.qualityTarget, 10, 100), featureScope: clamp(o.featureScope, 5, 100) });
  s.products.push(p);
  s.inventory[p.id] = emptyInventory(p.id);
  if (physical(s)) {
    const inv = s.inventory[p.id];
    inv.reorderQty = Math.max(20, Math.round(300000 / Math.max(1, p.baseUnitCost)));
    inv.reorderPoint = Math.round(inv.reorderQty * 0.5);
    const sup = s.suppliers.find((x) => x.status === 'active');
    if (sup) inv.supplierSplit = { [sup.id]: 1 };
  }
  return ok(`${p.name} is in development: ~${p.dev.effortRequired.toFixed(0)} engineer-months of effort.`);
}

export function updateDevPlan(s: SimState, productId: string, patch: Partial<{ monthlyBudget: number; qualityTarget: number; featureScope: number; speed: DevSpeed; engineeringShare: number }>): CommandResult {
  const p = product(s, productId);
  if (!p) return fail('Product not found.');
  const inDev = (p.stage === 'development' && p.dev.progress < 1) || p.updating;
  if (!inDev) return fail('This product is not in development.');
  for (const v of Object.values(patch)) if (typeof v === 'number' && (!finite(v) || v < 0)) return fail('Invalid value.');
  const done = p.dev.progress * p.dev.effortRequired;
  Object.assign(p.dev, patch);
  p.dev.qualityTarget = clamp(p.dev.qualityTarget, 10, 100);
  p.dev.featureScope = clamp(p.dev.featureScope, 5, 100);
  p.dev.engineeringShare = clamp(p.dev.engineeringShare, 0, 1);
  if (patch.qualityTarget !== undefined || patch.featureScope !== undefined) {
    p.dev.effortRequired = effortFor(s, p.dev.featureScope, p.dev.qualityTarget) * (p.updating ? 0.5 : 1);
    p.dev.progress = clamp(done / p.dev.effortRequired, 0, 0.999);
  }
  return ok('Development plan updated.');
}

export function startProductUpdate(s: SimState, productId: string, plan: { qualityTarget: number; featureScope: number; monthlyBudget: number; speed: DevSpeed }): CommandResult {
  const p = product(s, productId);
  if (!p || p.stage !== 'launched') return fail('Only launched products can be updated.');
  if (p.updating) return fail('An update is already in progress.');
  if (![plan.qualityTarget, plan.featureScope, plan.monthlyBudget].every(finite)) return fail('Invalid plan.');
  p.updating = true;
  p.dev = { ...p.dev, monthlyBudget: Math.max(0, plan.monthlyBudget), qualityTarget: clamp(plan.qualityTarget, 10, 100), featureScope: clamp(plan.featureScope, 5, 100), speed: plan.speed, engineeringShare: 1, progress: 0, spent: 0, defectRisk: 0, effortRequired: effortFor(s, plan.featureScope, plan.qualityTarget) * 0.5 };
  return ok(`Update to ${p.name} started (~${p.dev.effortRequired.toFixed(0)} engineer-months).`);
}

export function launchNow(s: SimState, productId: string, strategy: string): CommandResult {
  const p = product(s, productId);
  if (!p) return fail('Product not found.');
  const d = s.decisions.find((x) => !x.resolved && x.kind === 'launch_strategy' && x.data.productId === productId);
  if (d) return ok(resolveDecision(s, d.id, strategy));
  if (p.stage !== 'development' || p.dev.progress < 1) return fail('Not ready to launch.');
  return ok(launchProduct(s, p, strategy).join('. '));
}

export function discontinueProduct(s: SimState, productId: string): CommandResult {
  const p = product(s, productId);
  if (!p || p.stage === 'discontinued') return fail('Product not found.');
  if (s.products.filter((x) => x.stage === 'launched').length <= 1 && p.stage === 'launched') return fail('You cannot discontinue your only product on the market.');
  p.stage = 'discontinued';
  p.phase = 'discontinued';
  p.discontinuedDay = s.day;
  p.updating = false;
  const inv = s.inventory[p.id];
  let msg = `${p.name} discontinued. Its customers will leave over the coming months.`;
  if (inv && (inv.finished > 0 || inv.raw > 0)) {
    const [, costF] = takeFinished(inv, inv.finished);
    const rawCost = inv.rawValue;
    inv.raw = 0; inv.rawValue = 0;
    const liquidation = (costF + rawCost) * 0.4;
    recordOpex(s, 'writeoffs', costF + rawCost - liquidation);
    moveCash(s, liquidation, 'operating', 'Inventory liquidation');
    msg += ` Inventory liquidated for ₹${Math.round(liquidation).toLocaleString('en-IN')} (60% loss).`;
  }
  for (const o of s.orders) if (o.status === 'open' && o.productId === p.id) o.status = 'cancelled';
  return ok(msg);
}

export function setPlatformInvestment(s: SimState, productId: string, amount: number): CommandResult {
  const p = product(s, productId);
  if (!p) return fail('Product not found.');
  if (!finite(amount) || amount < 0) return fail('Invalid amount.');
  p.platformInvestment = amount;
  return ok(`Platform program: ₹${Math.round(amount).toLocaleString('en-IN')}/month.`);
}

export function filePatent(s: SimState, productId: string): CommandResult {
  return tech.filePatent(s, productId);
}

// ------------------------------------------------------------------ marketing

export function setMarketingBudget(s: SimState, channel: MarketingChannelId, amount: number): CommandResult {
  if (!CHANNELS[channel]) return fail('Unknown channel.');
  if (!finite(amount) || amount < 0) return fail('Budget must be zero or more.');
  if (channel === 'referral' || channel === 'affiliate') return fail('Referral and affiliate programs are paid per result — set the reward/commission instead.');
  s.marketing.budgets[channel] = Math.round(amount);
  const def = CHANNELS[channel];
  const warn = def.minEffective > 0 && amount > 0 && amount < def.minEffective ? ` Below ₹${def.minEffective.toLocaleString('en-IN')}/month this channel barely registers.` : '';
  return ok(`${def.name}: ₹${Math.round(amount).toLocaleString('en-IN')}/month.${warn}`);
}

export function setReferralReward(s: SimState, amount: number): CommandResult {
  if (!finite(amount) || amount < 0) return fail('Invalid reward.');
  s.marketing.referralReward = Math.round(amount);
  return ok(amount > 0 ? `Referral reward ₹${Math.round(amount).toLocaleString('en-IN')} per referred customer.` : 'Referral program off.');
}

export function setAffiliateRate(s: SimState, pct: number): CommandResult {
  if (!finite(pct) || pct < 0 || pct > 40) return fail('Commission must be between 0% and 40%.');
  s.marketing.affiliateRate = pct;
  return ok(pct > 0 ? `Affiliate commission ${pct}% of first 3 months' revenue.` : 'Affiliate program off.');
}

export function startExperiment(s: SimState, kind: Experiment['kind'], productId: string | null): CommandResult {
  return growth.startExperiment(s, kind, productId);
}

export function shipExperiment(s: SimState, id: string): CommandResult {
  return ok(growth.shipExperiment(s, id));
}

export function discardExperiment(s: SimState, id: string): CommandResult {
  const x = s.experiments.find((e) => e.id === id);
  if (!x || x.status !== 'complete') return fail('Nothing to discard.');
  x.status = 'discarded';
  return ok('Variant discarded; the control stays live.');
}

// ------------------------------------------------------------------ company & strategy

export function setManagementStyle(s: SimState, style: ManagementStyle): CommandResult {
  s.company.managementStyle = style;
  return ok('Management style updated. Culture will shift gradually.');
}

export function setRemotePolicy(s: SimState, policy: RemotePolicy): CommandResult {
  s.company.remotePolicy = policy;
  return ok(`Work policy: ${policy}.`);
}

export function setObjective(s: SimState, objective: Objective): CommandResult {
  s.company.objective = objective;
  return ok('Strategic objective updated.');
}

export function setFounderSalary(s: SimState, amount: number): CommandResult {
  if (!finite(amount) || amount < 0) return fail('Invalid salary.');
  s.company.founderSalary = Math.round(amount);
  return ok(`Founder salary ₹${Math.round(amount).toLocaleString('en-IN')}/month.`);
}

export function setWarranty(s: SimState, policy: 'none' | 'standard' | 'extended'): CommandResult {
  s.company.warrantyPolicy = policy;
  return ok(`Warranty policy: ${policy}.`);
}

export function setGtm(s: SimState, gtm: GtmChannel): CommandResult {
  if (!GTM[gtm]) return fail('Unknown channel.');
  if (s.company.gtm === gtm) return ok('No change.');
  const cost = Math.round(Math.max(200000, (s.reports[s.reports.length - 1]?.kpis.revenue ?? 0) * 0.5));
  payExpense(s, 'other', cost, 'Channel transition');
  s.company.gtm = gtm;
  return ok(`Go-to-market switched to ${GTM[gtm].name}. Transition cost ₹${cost.toLocaleString('en-IN')}.`);
}

export function setAudience(s: SimState, audience: Audience): CommandResult {
  s.company.audience = audience;
  return ok(`Audience focus: ${audience.toUpperCase()}.`);
}

export function setDeptBudget(s: SimState, dept: DeptId, amount: number): CommandResult {
  if (!s.departments[dept]) return fail('Unknown department.');
  if (!finite(amount) || amount < 0) return fail('Invalid budget.');
  s.departments[dept].budget = Math.round(amount);
  return ok(`${dept} budget ₹${Math.round(amount).toLocaleString('en-IN')}/month.`);
}

export function setEsgBudgets(s: SimState, b: { sustainability: number; community: number; welfare: number }): CommandResult {
  if (![b.sustainability, b.community, b.welfare].every((v) => finite(v) && v >= 0)) return fail('Invalid budget.');
  s.esg.sustainabilityBudget = b.sustainability;
  s.esg.communityBudget = b.community;
  s.esg.welfareBudget = b.welfare;
  return ok('ESG budgets updated.');
}

// ------------------------------------------------------------------ people

export function openJob(s: SimState, o: { role: RoleId; level: number; count: number; salaryOffer?: number; marketId?: string; autoHire?: boolean; minSkill?: number }): CommandResult {
  const r = running(s); if (r) return r;
  if (o.role === 'founder') return fail('Cannot hire another founder.');
  if (!finite(o.count) || o.count < 1 || o.count > 200) return fail('Hire between 1 and 200 people per opening.');
  if (o.salaryOffer !== undefined && (!finite(o.salaryOffer) || o.salaryOffer <= 0)) return fail('Invalid salary.');
  if (o.marketId && !s.markets.find((m) => m.id === o.marketId && (m.entered || m.entering))) return fail('You can only hire in markets you operate in.');
  const j = hiring.openJob(s, o);
  return ok(`Opened ${j.count} ${o.role.replace('_', ' ')} role(s) at ₹${j.salaryOffer.toLocaleString('en-IN')}/month.`);
}

export function closeJob(s: SimState, id: string): CommandResult { hiring.closeJob(s, id); return ok('Opening closed.'); }
export function makeOffer(s: SimState, jobId: string, candidateId: string, amount: number): CommandResult {
  if (!finite(amount) || amount <= 0) return fail('Invalid offer.');
  const r = hiring.makeOffer(s, jobId, candidateId, amount);
  return { ok: r.result === 'accepted', message: r.message };
}
export function interview(s: SimState, jobId: string, candidateId: string): CommandResult { return ok(hiring.interview(s, jobId, candidateId)); }
export function rejectCandidate(s: SimState, jobId: string, candidateId: string): CommandResult { hiring.rejectCandidate(s, jobId, candidateId); return ok('Candidate rejected.'); }
export function promote(s: SimState, id: string): CommandResult { return ok(people.promote(s, id)); }
export function giveRaise(s: SimState, id: string, pct: number): CommandResult {
  if (!finite(pct) || pct <= 0 || pct > 100) return fail('Raise must be between 0% and 100%.');
  return ok(people.giveRaise(s, id, pct));
}
export function terminate(s: SimState, id: string): CommandResult { return ok(people.terminate(s, id)); }
export function layoff(s: SimState, dept: DeptId | null, count: number): CommandResult {
  if (!finite(count) || count < 1) return fail('Choose how many people.');
  return ok(people.layoff(s, dept, count));
}

// ------------------------------------------------------------------ operations

export function placeOrder(s: SimState, productId: string, supplierId: string, qty: number): CommandResult {
  if (!finite(qty) || qty <= 0) return fail('Quantity must be positive.');
  const r = suppliers.placeOrder(s, productId, supplierId, qty);
  return { ok: r.ok, message: r.message };
}
export function cancelOrder(s: SimState, id: string): CommandResult { return ok(suppliers.cancelOrder(s, id)); }
export function setReorderPolicy(s: SimState, productId: string, point: number, qty: number, auto: boolean): CommandResult {
  const inv = s.inventory[productId];
  if (!inv) return fail('Product not found.');
  if (![point, qty].every((v) => finite(v) && v >= 0)) return fail('Invalid policy.');
  inv.reorderPoint = Math.round(point);
  inv.reorderQty = Math.round(qty);
  inv.autoReorder = auto;
  return ok(auto ? `Auto-reorder ${Math.round(qty)} units when stock falls below ${Math.round(point)}.` : 'Auto-reorder off.');
}
export function setSupplierSplit(s: SimState, productId: string, split: Record<string, number>): CommandResult {
  const inv = s.inventory[productId];
  if (!inv) return fail('Product not found.');
  const clean: Record<string, number> = {};
  for (const [id, w] of Object.entries(split)) if (finite(w) && w > 0 && s.suppliers.some((x) => x.id === id)) clean[id] = w;
  if (!Object.keys(clean).length) return fail('Choose at least one supplier.');
  inv.supplierSplit = clean;
  return ok('Supplier allocation updated.');
}
export function negotiateSupplier(s: SimState, supplierId: string, term: 'price' | 'payment_terms' | 'lead_time' | 'exclusivity' | 'min_order'): CommandResult {
  return suppliers.negotiateSupplier(s, supplierId, term);
}
export function setProductionTarget(s: SimState, productId: string, perDay: number): CommandResult {
  const inv = s.inventory[productId];
  if (!inv) return fail('Product not found.');
  if (!finite(perDay) || perDay < 0) return fail('Invalid target.');
  inv.productionTarget = perDay;
  return ok(perDay > 0 ? `Producing up to ${Math.round(perDay)} units/day.` : 'Production on automatic (≈30 days of cover).');
}
export function buildFactory(s: SimState, marketId: string, lines: number, owned: boolean): CommandResult { return mfg.buildFactory(s, marketId, lines, owned); }
export function addLines(s: SimState, factoryId: string, n: number): CommandResult { return mfg.addLines(s, factoryId, n); }
export function setMaintenance(s: SimState, factoryId: string, amount: number): CommandResult {
  const f = s.factories.find((x) => x.id === factoryId);
  if (!f) return fail('Factory not found.');
  if (!finite(amount) || amount < 0) return fail('Invalid budget.');
  f.maintenanceBudget = Math.round(amount);
  return ok('Maintenance budget updated.');
}
export function openFacility(s: SimState, marketId: string, spec: fac.FacilitySpec, buy: boolean): CommandResult { return fac.openFacility(s, marketId, spec, buy); }
export function closeFacility(s: SimState, id: string): CommandResult { return fac.closeFacility(s, id); }
export function buyFacility(s: SimState, id: string): CommandResult { return fac.buyFacility(s, id); }
export function enterMarket(s: SimState, marketId: string): CommandResult { return expansion.enterMarket(s, marketId); }
export function exitMarket(s: SimState, marketId: string): CommandResult { return expansion.exitMarket(s, marketId); }

// ------------------------------------------------------------------ finance

export function takeLoan(s: SimState, kind: LoanKind, amount: number): CommandResult {
  if (!finite(amount) || amount <= 0) return fail('Enter an amount.');
  return loans.takeLoan(s, kind, amount);
}
export function repayLoan(s: SimState, id: string, amount: number): CommandResult {
  if (!finite(amount) || amount <= 0) return fail('Enter an amount.');
  return loans.repayLoan(s, id, amount);
}
export function startRaise(s: SimState, kind: RoundKind): CommandResult { return capital.startRaise(s, kind); }
export function acceptTermSheet(s: SimState, id: string): CommandResult { return capital.acceptTermSheet(s, id); }
export function negotiateTermSheet(s: SimState, id: string, preMoney: number): CommandResult {
  if (!finite(preMoney) || preMoney <= 0) return fail('Invalid valuation.');
  return capital.negotiateTermSheet(s, id, preMoney);
}
export function declineTermSheet(s: SimState, id: string): CommandResult { capital.declineTermSheet(s, id); return ok('Term sheet declined.'); }
export function cancelRaise(s: SimState): CommandResult { capital.cancelRaise(s); return ok('Fundraising paused.'); }
export function createOptionPool(s: SimState, pct: number): CommandResult {
  if (!finite(pct) || pct <= 0 || pct > 0.3) return fail('Pool must be between 0% and 30%.');
  return ok(capital.createOptionPool(s, pct));
}
export function startIpo(s: SimState): CommandResult { return stock.startIpo(s); }
export function setDividend(s: SimState, perShareQuarterly: number): CommandResult {
  if (!s.company.isPublic) return fail('Only public companies pay dividends here.');
  if (!finite(perShareQuarterly) || perShareQuarterly < 0) return fail('Invalid dividend.');
  s.finance.dividendPolicy.perShareQuarterly = perShareQuarterly;
  return ok(perShareQuarterly > 0 ? `Quarterly dividend ₹${perShareQuarterly.toFixed(2)}/share.` : 'Dividends suspended; profits are reinvested.');
}
export function setBuyback(s: SimState, monthly: number): CommandResult {
  if (!s.company.isPublic) return fail('Buybacks require a listed stock.');
  if (!finite(monthly) || monthly < 0) return fail('Invalid budget.');
  s.finance.buybackBudget = monthly;
  return ok(monthly > 0 ? `Buying back up to ₹${Math.round(monthly).toLocaleString('en-IN')} of stock per month.` : 'Buybacks stopped.');
}

// ------------------------------------------------------------------ M&A & exit

export function acquireCompetitor(s: SimState, id: string, offer: number, payment: 'cash' | 'stock'): CommandResult {
  if (!finite(offer) || offer <= 0) return fail('Invalid offer.');
  return ma.acquireCompetitor(s, id, offer, payment);
}
export function mergeWith(s: SimState, id: string, governance: 'our_ceo' | 'co_ceo' | 'their_ceo'): CommandResult { return ma.mergeWith(s, id, governance); }
export function founderBuyout(s: SimState, pct: number): CommandResult {
  if (!finite(pct) || pct <= 0 || pct > 1) return fail('Choose a share between 0 and 100%.');
  return ma.founderBuyout(s, pct);
}
export function privateSale(s: SimState): CommandResult {
  const v = computeValuation(s).value;
  if (v < 10000000) return fail('Buyers are not interested below a ₹1 Cr valuation.');
  ma.sellCompany(s, 'a private equity buyer', Math.round(v * 0.9), 'private_sale');
  return ok(`Sold to a private equity buyer for ₹${(v * 0.9 / 1e7).toFixed(2)} Cr.`);
}

// ------------------------------------------------------------------ technology & risk

export function startTechUpgrade(s: SimState, track: TechTrack): CommandResult { return tech.startTechUpgrade(s, track); }
export function startResearch(s: SimState, id: string): CommandResult { return tech.startResearch(s, id); }
export function setResearchBudget(s: SimState, amount: number): CommandResult {
  if (!finite(amount) || amount < 0) return fail('Invalid budget.');
  s.research.budget = Math.round(amount);
  return ok(`Research lab budget ₹${Math.round(amount).toLocaleString('en-IN')}/month.`);
}
export function setSecurityBudget(s: SimState, amount: number): CommandResult {
  if (!finite(amount) || amount < 0) return fail('Invalid budget.');
  s.security.budget = Math.round(amount);
  return ok(`Security budget ₹${Math.round(amount).toLocaleString('en-IN')}/month.`);
}

export function decide(s: SimState, decisionId: string, optionId: string): CommandResult {
  const d = s.decisions.find((x) => x.id === decisionId);
  if (!d || d.resolved) return fail('Decision no longer open.');
  const msg = resolveDecision(s, decisionId, optionId);
  return ok(msg);
}

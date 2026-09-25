// Building a new game: company, founder, first product, markets, suppliers,
// competitors and the macro environment, all from the player's configuration.
import { INDUSTRIES } from './data/industries';
import { MARKETS, MARKET_BY_ID } from './data/markets';
import { CHANNEL_IDS } from './data/channels';
import { DEPARTMENTS } from './data/roles';
import { RESEARCH_PROJECTS } from './data/technology';
import type { DeptId, GameConfig, MarketingChannelId, RoleId, SimState } from './types';
import { seedRng } from './rng';
import { msKey } from './util';
import { emptyMonth } from './systems/ledger';
import { initialMacro } from './systems/macro';
import { createEmployee } from './systems/employees';
import { newProduct, createLaunchDecision } from './systems/products';
import { emptyInventory } from './systems/inventory';
import { generateSuppliers } from './systems/suppliers';
import { generateCompetitors } from './systems/competitors';
import { initialCapTable } from './systems/capital';
import { initialBoard } from './systems/board';
import { suggestedPriceMult } from './systems/pricing';
import { capacityPerSize, facilityRent } from './systems/facilities';
import { segmentsFor, physical } from './context';
import { applyScenarioSetup } from './systems/scenarios';
import { computeValuation } from './systems/valuation';
import { uid } from './util';

export const SCHEMA_VERSION = 1;

export function defaultConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return {
    companyName: 'Nimbus Labs',
    founderName: 'Aarav Sharma',
    industry: 'saas',
    hqMarket: 'blr',
    startingCapital: 5000000,
    companyType: 'private_limited',
    monetization: 'subscription',
    gtm: 'dtc',
    audience: 'b2b',
    targetSegment: 'smb',
    mission: 'Make great software affordable for every business.',
    strategy: 'differentiation',
    riskTolerance: 'medium',
    difficulty: 'normal',
    scenarioId: null,
    tutorial: true,
    seed: 20270101,
    sandbox: { marketSizeMult: 1, competitorCount: 4, economy: 'normal', eventFrequency: 1 },
    ...overrides,
  };
}

function firstHireRole(config: GameConfig): RoleId {
  const f = INDUSTRIES[config.industry].fulfillment;
  if (f === 'digital') return 'engineer';
  if (f === 'service') return 'specialist';
  return 'ops_associate';
}

export function createGame(config: GameConfig): SimState {
  const ind = INDUSTRIES[config.industry];
  if (!ind) throw new Error(`Unknown industry ${config.industry}`);
  if (!MARKET_BY_ID[config.hqMarket]) throw new Error(`Unknown market ${config.hqMarket}`);
  if (!ind.monetizations.includes(config.monetization)) config = { ...config, monetization: ind.defaultMonetization };
  const capital = Math.max(0, Math.round(config.startingCapital));
  const budgets = Object.fromEntries(CHANNEL_IDS.map((c) => [c, 0])) as Record<MarketingChannelId, number>;
  const departments = Object.fromEntries(DEPARTMENTS.map((d) => [d.id, { budget: 0 }])) as Record<DeptId, { budget: number }>;
  const s: SimState = {
    schemaVersion: SCHEMA_VERSION,
    runId: `run-${config.seed.toString(36)}-${Date.now().toString(36)}`,
    seed: config.seed,
    rng: seedRng(config.seed),
    day: 0,
    startYear: 2027,
    startMonth: 1,
    config: { ...config, startingCapital: capital },
    status: 'running',
    outcome: null,
    company: {
      name: config.companyName.trim() || 'Untitled Co.',
      founderName: config.founderName.trim() || 'Founder',
      mission: config.mission,
      brand: 28,
      reputation: { customer: 55, employer: 55, investor: 50, regulatory: 70 },
      culture: { innovation: 55, discipline: 50, collaboration: 65, riskTolerance: config.riskTolerance === 'high' ? 70 : config.riskTolerance === 'low' ? 35 : 50, satisfaction: 65, executionSpeed: 70 },
      managementStyle: 'balanced',
      objective: 'growth',
      remotePolicy: 'hybrid',
      founderSalary: 0,
      awareness: {},
      gtm: config.gtm,
      audience: config.audience,
      isPublic: false,
      lastLayoffDay: null,
      layoffShock: 0,
      warrantyPolicy: 'standard',
      concentrationTop: 0,
      pmf: 0,
      reviews: [],
      reviewRating: 3.6,
    },
    products: [],
    cells: {},
    markets: MARKETS.map((m) => ({ id: m.id, entered: m.id === config.hqMarket, entering: false, entryCompleteDay: null, enteredDay: m.id === config.hqMarket ? 0 : null, sizeMult: 1, priceMult: 1, localTeam: 0 })),
    marketing: {
      budgets,
      seoStock: 0.02,
      contentStock: 0.01,
      referralReward: 0,
      affiliateRate: 0,
      funnelMods: { interest: 1, visit: 1, consideration: 1, trial: 1, purchase: 1, activation: 1 },
      launchBoostUntil: 0,
      sourceMix: {},
    },
    sales: { pipeline: {}, wonThisMonth: 0, lostThisMonth: 0, largeDealChance: 0 },
    contracts: [],
    partnerships: [],
    experiments: [],
    employees: [],
    openings: [],
    pendingHires: [],
    departments,
    inventory: {},
    suppliers: [],
    orders: [],
    factories: [],
    facilities: [],
    finance: {
      cash: capital,
      ar: [],
      ap: [],
      accruedPayroll: 0,
      taxPayable: 0,
      deferredRevenue: 0,
      assets: [],
      goodwill: 0,
      paidInCapital: capital,
      retainedEarnings: 0,
      treasuryStock: 0,
      taxLossCarryforward: 0,
      overdraftMonths: 0,
      dividendsPaid: 0,
      dividendPolicy: { perShareQuarterly: 0 },
      buybackBudget: 0,
    },
    loans: [],
    capTable: [],
    rounds: [],
    raise: null,
    board: { members: [], confidence: 70, lowConfidenceMonths: 0, expectations: null, approvalsRequired: false, lastMeetingNote: '' },
    stock: null,
    ipo: null,
    competitors: [],
    macro: initialMacro(config.difficulty === 'sandbox' ? config.sandbox.economy : 'normal'),
    modifiers: [],
    events: [],
    news: [],
    decisions: [],
    negotiations: [],
    legalCases: [],
    tech: { levels: { automation: 0, ai: 0, analytics: 0, manufacturing: 0, cybersecurity: 0, infrastructure: 0 }, upgrading: null },
    research: { budget: 0, projects: Object.fromEntries(RESEARCH_PROJECTS.map((r) => [r.id, { id: r.id, progress: 0, status: 'available' as const }])), active: null, pointsThisMonth: 0, unlocked: [] },
    security: { budget: 0, vulnerability: 40, incidents: 0, recoveringUntil: 0, lastIncidentDay: null },
    esg: { sustainabilityBudget: 0, communityBudget: 0, welfareBudget: 0, emissions: 0, score: 50 },
    reports: [],
    month: emptyMonth(capital),
    alerts: [],
    achievements: {},
    scenario: null,
    metrics: {
      responseHours: 4,
      reliability: 90,
      fillRate: {},
      serviceUtilization: 0,
      serviceCapacity: 0,
      outageDays: 0,
      securityScore: 60,
      engineeringCapacity: 0,
      researchCapacity: 0,
      valuation: 0,
      valuationDrivers: [],
      marketShare: 0,
      revenueRunRate: 0,
      learningUnits: {},
      officeUtilization: 0.5,
      warehouseUtilization: 0,
    },
    counters: { nextId: 0 },
    flags: { monthStartDay: 0 },
    log: [],
  };

  s.capTable = initialCapTable(s, s.company.founderName);
  s.board = initialBoard(s, s.company.founderName);

  // Founder and first hire.
  const founder = createEmployee(s, 'founder', 4, config.hqMarket, { skill: 62, salary: 0, name: s.company.founderName, experience: 6 });
  founder.morale = 85;
  founder.loyalty = 100;
  founder.key = true;
  founder.hireDay = -365;
  s.employees.push(founder);
  const early = createEmployee(s, firstHireRole(config), 2, config.hqMarket, { startProductive: true });
  early.morale = 78;
  s.employees.push(early);

  // Markets: HQ awareness seed from the founder's network; PPP price multipliers.
  for (const m of s.markets) m.priceMult = Math.round(suggestedPriceMult(s, m.id) * 100) / 100;
  for (const seg of segmentsFor(s)) s.company.awareness[msKey(config.hqMarket, seg)] = 0.004;

  // First product: ready to launch — the first decision is the launch strategy.
  const positioning = config.strategy === 'cost_leadership' ? 'budget' : config.strategy === 'differentiation' ? 'premium' : 'mainstream';
  const p = newProduct(s, {
    name: ind.startingProduct.name,
    category: ind.categories[0],
    positioning,
    monetization: config.monetization,
    qualityTarget: ind.startingProduct.quality,
    featureScope: ind.startingProduct.features,
    monthlyBudget: 0,
    speed: 'normal',
  });
  p.dev.progress = 1;
  p.quality = ind.startingProduct.quality;
  p.features = ind.startingProduct.features;
  p.readyNotified = true;
  s.products.push(p);
  s.inventory[p.id] = emptyInventory(p.id);

  // Small starter office.
  const officeSpec = { kind: 'office' as const, tier: 'basic' as const, size: 4 };
  s.facilities.push({ id: uid(s, 'fa'), kind: 'office', name: `${MARKET_BY_ID[config.hqMarket].name} starter office`, marketId: config.hqMarket, capacity: 4, quality: 42, owned: false, rent: facilityRent(s, config.hqMarket, officeSpec), purchasePrice: 0, assetId: null, openedDay: 0 });
  if (ind.requiresStores) {
    const storeSpec = { kind: 'store' as const, tier: 'basic' as const, size: 1 };
    s.facilities.push({ id: uid(s, 'fa'), kind: 'store', name: `${MARKET_BY_ID[config.hqMarket].name} ${ind.id === 'restaurants' ? 'outlet' : ind.id === 'healthcare' ? 'clinic' : 'store'} 1`, marketId: config.hqMarket, capacity: capacityPerSize(s, 'store'), quality: 42, owned: false, rent: facilityRent(s, config.hqMarket, storeSpec), purchasePrice: 0, assetId: null, openedDay: 0 });
  }

  if (physical(s)) {
    s.suppliers = generateSuppliers(s);
    const inv = s.inventory[p.id];
    const unit = Math.max(1, p.baseUnitCost);
    inv.reorderQty = Math.max(20, Math.round(Math.min(capital * 0.12, 600000) / unit));
    inv.reorderPoint = Math.round(inv.reorderQty * 0.5);
    const balanced = s.suppliers[1];
    inv.supplierSplit = { [balanced.id]: 1 };
  }
  s.competitors = generateCompetitors(s);

  applyScenarioSetup(s);
  s.metrics.valuation = computeValuation(s).value;
  if (!s.decisions.some((d) => d.kind === 'launch_strategy')) {
    const first = s.products.find((x) => x.stage === 'development' && x.dev.progress >= 1);
    if (first) createLaunchDecision(s, first);
  }
  s.month = emptyMonth(s.finance.cash);
  return s;
}

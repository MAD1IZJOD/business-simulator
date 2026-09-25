// Central simulation state and domain types.
// The engine mutates a SimState in place; the UI treats it as read-only and
// issues changes only through engine commands.

export type Id = string;

export type Difficulty = 'sandbox' | 'easy' | 'normal' | 'hard' | 'brutal';

export type IndustryId =
  | 'saas' | 'ai' | 'electronics' | 'ecommerce' | 'retail' | 'manufacturing' | 'food'
  | 'restaurants' | 'logistics' | 'healthcare' | 'fintech' | 'education' | 'gaming'
  | 'media' | 'automotive' | 'fashion' | 'realestate' | 'energy' | 'consulting' | 'cybersecurity';

export type SegmentId = 'students' | 'consumers' | 'budget' | 'luxury' | 'smb' | 'enterprise' | 'government';

export type Monetization =
  | 'subscription' | 'one_time' | 'freemium' | 'marketplace' | 'advertising' | 'commission'
  | 'licensing' | 'enterprise' | 'usage' | 'transaction_fee';

export type GtmChannel = 'dtc' | 'retail' | 'wholesale' | 'franchise';
export type Audience = 'b2b' | 'b2c' | 'b2b2c';

export type DeptId =
  | 'executive' | 'engineering' | 'product' | 'sales' | 'marketing' | 'finance' | 'hr'
  | 'operations' | 'legal' | 'security' | 'customer_success' | 'research';

export type RoleId =
  | 'founder' | 'engineer' | 'data_scientist' | 'product_manager' | 'designer' | 'sdr'
  | 'account_executive' | 'account_manager' | 'marketer' | 'finance_analyst' | 'recruiter'
  | 'ops_associate' | 'production_worker' | 'specialist' | 'lawyer' | 'security_engineer'
  | 'support_agent' | 'cs_manager' | 'researcher';

export type MarketingChannelId =
  | 'seo' | 'paid_search' | 'social' | 'influencer' | 'tv' | 'radio' | 'email' | 'events'
  | 'partnerships' | 'content' | 'outbound' | 'direct_sales' | 'referral' | 'affiliate';

/** Where a customer came from. Marketing channels plus non-paid sources. */
export type AttributionSource = MarketingChannelId | 'organic' | 'word_of_mouth' | 'partner' | 'acquisition' | 'contract';

export type ManagementStyle = 'aggressive_growth' | 'balanced' | 'efficiency' | 'employee_focused' | 'innovation';
export type Objective =
  | 'profit' | 'growth' | 'valuation' | 'market_share' | 'risk' | 'employees' | 'innovation';
export type RemotePolicy = 'office' | 'hybrid' | 'remote';
export type Positioning = 'budget' | 'mainstream' | 'premium' | 'luxury';
export type TechTrack = 'automation' | 'ai' | 'analytics' | 'manufacturing' | 'cybersecurity' | 'infrastructure';
export type Fulfillment = 'digital' | 'service' | 'inventory' | 'manufactured';
export type RiskTolerance = 'low' | 'medium' | 'high';

export type RngState = [number, number, number, number];

// ---------------------------------------------------------------- config

export interface SandboxOptions {
  marketSizeMult: number;
  competitorCount: number;
  economy: 'normal' | 'boom' | 'recession';
  eventFrequency: number; // 0..2
}

export interface GameConfig {
  companyName: string;
  founderName: string;
  industry: IndustryId;
  hqMarket: Id; // market id of headquarters (also the starting market)
  startingCapital: number; // INR
  companyType: 'private_limited' | 'llp' | 'sole_proprietorship';
  monetization: Monetization;
  gtm: GtmChannel;
  audience: Audience;
  targetSegment: SegmentId;
  mission: string;
  strategy: 'cost_leadership' | 'differentiation' | 'focus' | 'innovation';
  riskTolerance: RiskTolerance;
  difficulty: Difficulty;
  scenarioId: string | null;
  tutorial: boolean;
  seed: number;
  sandbox: SandboxOptions;
}

// ---------------------------------------------------------------- products

export type ProductStage = 'idea' | 'development' | 'launched' | 'discontinued';
export type LifecyclePhase = 'idea' | 'development' | 'launch' | 'growth' | 'maturity' | 'decline' | 'discontinued';
export type DevSpeed = 'lean' | 'normal' | 'crunch';

export interface DevPlan {
  monthlyBudget: number; // cash spent per month on contractors/tools
  qualityTarget: number; // 0..100
  featureScope: number; // 0..100
  speed: DevSpeed;
  engineeringShare: number; // 0..1 share of engineering capacity allocated
  progress: number; // 0..1
  effortRequired: number; // dev points
  spent: number;
  defectRisk: number; // 0..1 accumulated
}

export interface Patent {
  status: 'pending' | 'granted' | 'rejected' | 'expired';
  filedDay: number;
  decisionDay: number;
  expiresDay: number;
  strength: number; // 0..1
}

export interface Product {
  id: Id;
  name: string;
  category: string;
  monetization: Monetization;
  positioning: Positioning;
  stage: ProductStage;
  phase: LifecyclePhase;
  quality: number; // 0..100
  features: number; // 0..100
  price: number; // INR list price (per unit / month / take-rate% / ad load depending on monetization)
  baseUnitCost: number; // INR variable cost per unit at launch
  dev: DevPlan;
  launchDay: number | null;
  discontinuedDay: number | null;
  novelty: number; // 0..1.2 appeal multiplier driven by lifecycle
  satisfaction: number; // 0..100
  defectRate: number; // 0..1
  techDebt: number; // 0..100
  warrantyMonths: number;
  returnPolicyDays: number;
  patent: Patent | null;
  acquired: boolean;
  lastPrice: number; // price at start of month, for price-shock churn
  priceChangedDay: number | null;
  sellers: number; // marketplace supply side
  ecosystem: number; // platform integrations/developers
  platformInvestment: number; // monthly spend on platform/API program
  adLoad: number; // advertising monetization: 1..10
  developmentCost: number; // lifetime development cost (reported)
  updating: boolean; // a launched product with an update in development
  readyNotified: boolean;
  launchStrategy: string | null;
  cumulativeUnits: number;
}

export interface CustomerCell {
  productId: Id;
  marketId: Id;
  segmentId: SegmentId;
  customers: number; // paying / active customers
  freeUsers: number; // freemium free tier
  arpuMult: number; // expansion multiplier (seats/usage growth)
}

// ---------------------------------------------------------------- markets & macro

export interface MarketState {
  id: Id;
  entered: boolean;
  entering: boolean;
  entryCompleteDay: number | null;
  enteredDay: number | null;
  sizeMult: number; // cumulative market growth since start
  priceMult: number; // player-chosen price multiplier for this market
  localTeam: number; // not used for salaries, informational
}

export type MacroPhase = 'expansion' | 'boom' | 'slowdown' | 'recession' | 'recovery';
export type RecessionKind = 'demand' | 'financial' | 'supply';

export interface MacroState {
  phase: MacroPhase;
  phaseMonths: number;
  phaseLength: number;
  gdpGrowth: number; // annual %
  inflation: number; // annual %
  interestRate: number; // policy rate annual %
  unemployment: number; // %
  consumerConfidence: number; // 0..100 (50 neutral)
  businessConfidence: number; // 0..100
  fx: Record<string, number>; // INR per unit of currency
  fxBase: Record<string, number>;
  priceLevel: number; // cumulative inflation index (1 at start)
  marketIndex: number; // stock market index (1000 at start)
  fundingClimate: number; // 0.3..1.6 multiplier on investor appetite
  recessionKind: RecessionKind | null;
  severity: number; // 0..1 severity of current downturn / boom intensity
  recessionsSurvived: number;
}

// ---------------------------------------------------------------- marketing & sales

export interface MarketingState {
  budgets: Record<MarketingChannelId, number>; // monthly spend
  seoStock: number; // accumulated organic authority 0..1
  contentStock: number; // 0..1
  referralReward: number; // INR per referred customer
  affiliateRate: number; // % of attributed revenue
  funnelMods: { interest: number; visit: number; consideration: number; trial: number; purchase: number; activation: number };
  launchBoostUntil: number; // day
  /** Recent awareness gains by source per `${marketId}|${segmentId}` for attribution. */
  sourceMix: Record<string, Record<string, number>>;
}

export interface PipelineBucket {
  marketId: Id;
  segmentId: SegmentId;
  productId: Id;
  lead: number;
  qualified: number;
  proposal: number;
  negotiation: number;
}

export interface SalesState {
  pipeline: Record<string, PipelineBucket>;
  wonThisMonth: number;
  lostThisMonth: number;
  largeDealChance: number;
}

// ---------------------------------------------------------------- contracts & partnerships

export interface Contract {
  id: Id;
  client: string;
  segmentId: SegmentId;
  marketId: Id;
  productId: Id;
  annualValue: number;
  durationMonths: number;
  startDay: number;
  endDay: number;
  implementationCost: number;
  implementationMonths: number;
  supportLoad: number; // tickets per month
  paymentSchedule: 'monthly' | 'quarterly' | 'annual_upfront';
  paymentTermsDays: number;
  slaUptime: number; // e.g. 99.5
  penaltyRate: number; // share of monthly value credited per SLA breach
  renewalProbability: number;
  status: 'active' | 'renewed' | 'churned' | 'completed';
  satisfaction: number;
  penaltiesPaid: number;
  recognized: number;
}

export type PartnershipKind = 'distribution' | 'technology' | 'customers' | 'credibility' | 'infrastructure' | 'licensing';

export interface Partnership {
  id: Id;
  partner: string;
  kind: PartnershipKind;
  startDay: number;
  endDay: number;
  upfrontFee: number;
  revenueShare: number; // share of attributed revenue paid to partner (or received for licensing)
  strength: number; // 0..1
  marketId: Id | null;
  status: 'active' | 'ended';
  attributedRevenue: number;
}

export interface Experiment {
  id: Id;
  kind: 'pricing' | 'landing_page' | 'feature' | 'messaging';
  productId: Id | null;
  startDay: number;
  endDay: number;
  cost: number;
  trueEffect: number; // hidden
  status: 'running' | 'complete' | 'shipped' | 'discarded';
  sample: number;
  estimate: number;
  stdError: number;
  elasticity?: number;
}

// ---------------------------------------------------------------- people

export interface Employee {
  id: Id;
  name: string;
  role: RoleId;
  dept: DeptId;
  level: number; // 1..5
  salary: number; // monthly INR (home-currency equivalent at hire)
  skill: number; // 0..100
  experience: number; // years
  morale: number; // 0..100
  burnout: number; // 0..100
  loyalty: number; // 0..100
  performance: number; // 0..2 relative
  productivity: number; // computed
  marketId: Id; // location
  hireDay: number;
  probationEndDay: number;
  lastPromotionDay: number;
  options: number; // stock options granted
  key: boolean;
}

export interface Candidate {
  id: Id;
  name: string;
  skill: number; // true skill (hidden)
  perceivedSkill: number;
  uncertainty: number;
  experience: number;
  askSalary: number;
  flexibility: number; // 0..0.2 how far below ask they'd accept
  interest: number; // 0..1
  interviewed: boolean;
  arrivedDay: number;
  expiresDay: number;
  status: 'new' | 'offered' | 'declined' | 'accepted' | 'rejected' | 'expired';
  counterOffer?: number;
}

export interface JobOpening {
  id: Id;
  role: RoleId;
  level: number;
  count: number;
  filled: number;
  salaryOffer: number; // monthly
  marketId: Id;
  openedDay: number;
  autoHire: boolean;
  minSkill: number;
  candidates: Candidate[];
  candidateAccumulator: number;
}

export interface PendingHire {
  id: Id;
  candidate: Candidate;
  openingId: Id;
  role: RoleId;
  level: number;
  salary: number;
  marketId: Id;
  startDay: number;
}

export interface DepartmentState {
  budget: number; // monthly non-salary budget (tools, training)
}

// ---------------------------------------------------------------- operations

export interface InventoryState {
  productId: Id;
  finished: number; // units
  finishedValue: number; // INR at cost
  raw: number; // material kits
  rawValue: number;
  wip: number;
  wipValue: number;
  damaged: number;
  reorderPoint: number; // units (finished for inventory industries, raw for manufactured)
  reorderQty: number;
  autoReorder: boolean;
  productionTarget: number; // units/day for manufactured
  supplierSplit: Record<Id, number>; // supplier id -> share
  stockoutDays: number;
  lostUnits: number;
}

export interface Supplier {
  id: Id;
  name: string;
  marketId: Id; // location
  costMult: number; // multiplier on material base cost
  reliability: number; // 0..1 on-time probability
  leadTimeDays: number;
  quality: number; // 0..100
  capacity: number; // units per month
  paymentTermsDays: number;
  minOrder: number;
  exclusive: boolean;
  risk: number; // 0..1 disruption propensity
  relationship: number; // 0..100
  status: 'active' | 'disrupted' | 'bankrupt';
  disruptedUntil: number;
  contracted: boolean;
  volumeThisMonth: number;
  lateDeliveries: number;
}

export interface PurchaseOrder {
  id: Id;
  productId: Id;
  supplierId: Id;
  qty: number;
  unitCost: number;
  orderDay: number;
  dueDay: number;
  kind: 'raw' | 'finished';
  status: 'open' | 'delivered' | 'cancelled';
  late: boolean;
}

export interface Factory {
  id: Id;
  name: string;
  marketId: Id;
  lines: number;
  linesUnderConstruction: number;
  constructionDoneDay: number;
  capacityPerLine: number; // units per day at 100%
  condition: number; // 0..100 machine condition
  maintenanceBudget: number; // monthly
  owned: boolean;
  rent: number;
  utilization: number;
  status: 'operational' | 'building';
  readyDay: number;
  energyPerUnit: number; // kWh equivalent cost INR
}

export type FacilityKind = 'office' | 'warehouse' | 'store' | 'lab';

export interface Facility {
  id: Id;
  kind: FacilityKind;
  name: string;
  marketId: Id;
  capacity: number; // desks / units / customers per month
  quality: number; // 0..100
  owned: boolean;
  rent: number; // monthly if leased
  purchasePrice: number;
  assetId: Id | null;
  openedDay: number;
}

// ---------------------------------------------------------------- finance

export interface Bucket {
  dueDay: number;
  amount: number;
  label: string;
}

export interface FixedAsset {
  id: Id;
  label: string;
  category: 'equipment' | 'building' | 'factory' | 'software' | 'vehicle';
  cost: number;
  bookValue: number;
  lifeMonths: number;
  acquiredDay: number;
  marketValueMult: number; // for real estate
}

export interface FinanceState {
  cash: number; // may go negative only as overdraft
  ar: Bucket[];
  ap: Bucket[];
  accruedPayroll: number;
  taxPayable: number;
  deferredRevenue: number;
  assets: FixedAsset[];
  goodwill: number;
  paidInCapital: number;
  retainedEarnings: number;
  treasuryStock: number;
  taxLossCarryforward: number;
  overdraftMonths: number;
  dividendsPaid: number;
  dividendPolicy: { perShareQuarterly: number };
  buybackBudget: number; // monthly
}

export type LoanKind = 'bank' | 'venture_debt' | 'revolver' | 'equipment' | 'acquisition';

export interface Covenant {
  kind: 'min_cash' | 'max_leverage' | 'interest_coverage';
  threshold: number;
  breached: boolean;
  breachCount: number;
}

export interface Loan {
  id: Id;
  kind: LoanKind;
  lender: string;
  principal: number; // original
  balance: number;
  limit: number; // revolver limit
  rate: number; // annual %
  termMonths: number;
  monthsRemaining: number;
  monthlyPayment: number;
  startDay: number;
  missedPayments: number;
  covenants: Covenant[];
  status: 'active' | 'repaid' | 'defaulted';
}

export interface Shareholder {
  id: Id;
  name: string;
  kind: 'founder' | 'employee' | 'investor' | 'option_pool' | 'public';
  shares: number;
  invested: number;
  round: string | null;
  investorId?: string;
}

export type RoundKind = 'friends_family' | 'angel' | 'seed' | 'series_a' | 'series_b' | 'series_c' | 'growth';

export interface TermSheet {
  id: Id;
  investorId: string;
  investorName: string;
  amount: number;
  preMoney: number;
  boardSeat: boolean;
  optionPoolTopUp: number; // % of post-money
  liquidationPref: number;
  expectation: string;
  expectedGrowth: number; // annual growth expected
  expiresDay: number;
  negotiationRounds: number;
  reservationPreMoney: number; // hidden max
  status: 'open' | 'accepted' | 'rejected' | 'withdrawn' | 'expired';
}

export interface FundingRound {
  kind: RoundKind;
  day: number;
  amount: number;
  preMoney: number;
  postMoney: number;
  pricePerShare: number;
  newShares: number;
  investors: string[];
}

export interface ActiveRaise {
  kind: RoundKind;
  target: number;
  startedDay: number;
  closesDay: number;
  termSheets: TermSheet[];
  pitched: number;
}

export interface BoardMember {
  id: Id;
  name: string;
  kind: 'founder' | 'investor' | 'independent';
  priority: 'growth' | 'profitability' | 'risk' | 'employees' | 'market_share';
  satisfaction: number; // 0..100
}

export interface BoardState {
  members: BoardMember[];
  confidence: number;
  lowConfidenceMonths: number;
  expectations: { growth: number; minRunwayMonths: number } | null;
  approvalsRequired: boolean;
  lastMeetingNote: string;
}

export interface StockState {
  ipoDay: number;
  ipoPrice: number;
  price: number;
  sharesOutstanding: number;
  history: { day: number; price: number }[];
  consensusEps: number;
  lastEps: number;
  analystRating: 'buy' | 'hold' | 'sell';
  sentiment: number; // -1..1
}

export interface IpoProcess {
  startedDay: number;
  readyDay: number;
  cost: number;
  targetRaise: number;
}

// ---------------------------------------------------------------- competitors

export type CompetitorStrategy = 'price_leader' | 'premium' | 'innovator' | 'fast_follower' | 'aggressive_growth' | 'niche';

export interface Competitor {
  id: Id;
  name: string;
  strategy: CompetitorStrategy;
  priceIndex: number; // relative to reference price
  quality: number;
  brand: number;
  cash: number;
  marketingSpend: number; // monthly
  headcount: number;
  avgSalary: number;
  grossMargin: number;
  customers: Record<string, number>; // `${marketId}|${segmentId}`
  awareness: Record<Id, number>; // marketId -> 0..1
  markets: Id[];
  products: number;
  lastLaunchDay: number;
  fundingStage: RoundKind | 'bootstrapped' | 'public';
  totalRaised: number;
  revenueHistory: number[]; // monthly
  headcountHistory: number[];
  status: 'active' | 'bankrupt' | 'acquired';
  negativeCashMonths: number;
  valuation: number;
  novelty: number;
  priceWarUntil: number;
  intelNoise: number; // persistent noise factor for estimates
  patents: number;
}

// ---------------------------------------------------------------- events, news, decisions

export type ModifierTarget =
  | 'demand' | 'churn' | 'material_cost' | 'lead_time' | 'supplier_capacity' | 'conversion'
  | 'awareness_gain' | 'productivity' | 'energy_cost' | 'compliance_cost' | 'hiring_speed'
  | 'outage' | 'defects' | 'wage' | 'brand_target' | 'cac' | 'funding' | 'price_sensitivity';

export interface Modifier {
  id: Id;
  target: ModifierTarget;
  value: number; // multiplicative
  scope: string | null; // e.g. supplier id, market id, product id
  startDay: number;
  endDay: number;
  source: string;
}

export type EventCategory = 'market' | 'operations' | 'people' | 'legal' | 'security' | 'customers' | 'competition' | 'macro' | 'finance' | 'product';

export interface EventRecord {
  id: Id;
  defId: string;
  day: number;
  title: string;
  description: string;
  category: EventCategory;
  sentiment: 'positive' | 'negative' | 'neutral';
  effects: string[]; // human-readable consequences with numbers
  decisionId: Id | null;
}

export interface NewsItem {
  id: Id;
  day: number;
  headline: string;
  body: string;
  category: 'company' | 'competitor' | 'market' | 'macro' | 'event' | 'industry';
  sentiment: 'positive' | 'negative' | 'neutral';
}

export interface DecisionOption {
  id: string;
  label: string;
  description: string;
  consequences: string[];
}

export interface Decision {
  id: Id;
  kind: string;
  category: 'decision' | 'opportunity' | 'crisis';
  title: string;
  description: string;
  createdDay: number;
  expiresDay: number;
  options: DecisionOption[];
  defaultOption: string;
  data: Record<string, unknown>;
  resolved: boolean;
  chosen: string | null;
  outcome: string | null;
}

export interface Negotiation {
  id: Id;
  kind: 'funding' | 'supplier' | 'contract' | 'acquisition' | 'salary' | 'loan';
  subjectId: Id;
  anchor: number; // their opening number
  reservation: number; // hidden walk-away number
  higherIsBetterForUs: boolean;
  patience: number;
  rounds: number;
  lastOffer: number;
  status: 'open' | 'agreed' | 'failed';
  history: { by: 'us' | 'them'; value: number }[];
}

export interface LegalCase {
  id: Id;
  kind: 'lawsuit' | 'contract_dispute' | 'ip_dispute' | 'regulatory' | 'employment';
  title: string;
  exposure: number; // potential damages
  monthlyCost: number;
  winProbability: number;
  openedDay: number;
  resolveDay: number;
  status: 'open' | 'settled' | 'won' | 'lost';
  fighting: boolean;
}

export interface Alert {
  id: string;
  severity: 'info' | 'warning' | 'critical' | 'opportunity';
  title: string;
  detail: string;
  day: number;
  link?: string;
}

export interface Insight {
  id: string;
  title: string;
  detail: string;
  tone: 'positive' | 'negative' | 'neutral';
  evidence: string[];
}

// ---------------------------------------------------------------- tech, research, risk, esg

export interface TechState {
  levels: Record<TechTrack, number>; // 0..5
  upgrading: { track: TechTrack; doneDay: number } | null;
}

export interface ResearchProject {
  id: string;
  progress: number; // research points accumulated
  status: 'available' | 'active' | 'done' | 'locked';
}

export interface ResearchState {
  budget: number; // monthly lab budget
  projects: Record<string, ResearchProject>;
  active: string | null;
  pointsThisMonth: number;
  unlocked: string[];
}

export interface SecurityState {
  budget: number;
  vulnerability: number; // 0..100
  incidents: number;
  recoveringUntil: number;
  lastIncidentDay: number | null;
}

export interface EsgState {
  sustainabilityBudget: number;
  communityBudget: number;
  welfareBudget: number;
  emissions: number; // tonnes this month
  score: number; // 0..100
}

export interface Reputation {
  customer: number;
  employer: number;
  investor: number;
  regulatory: number;
}

export interface Culture {
  innovation: number;
  discipline: number;
  collaboration: number;
  riskTolerance: number;
  satisfaction: number;
  executionSpeed: number;
}

export interface CompanyState {
  name: string;
  founderName: string;
  mission: string;
  brand: number;
  reputation: Reputation;
  culture: Culture;
  managementStyle: ManagementStyle;
  objective: Objective;
  remotePolicy: RemotePolicy;
  founderSalary: number;
  awareness: Record<string, number>; // `${marketId}|${segmentId}`
  gtm: GtmChannel;
  audience: Audience;
  isPublic: boolean;
  lastLayoffDay: number | null;
  layoffShock: number; // 0..1 decaying
  warrantyPolicy: 'none' | 'standard' | 'extended';
  concentrationTop: number;
  pmf: number;
  reviews: Review[];
  reviewRating: number;
}

export interface Review {
  id: Id;
  day: number;
  productId: Id;
  rating: number;
  text: string;
  segmentId: SegmentId;
}

export interface Outcome {
  kind: 'failure' | 'acquired' | 'private_sale' | 'scenario_win' | 'ousted';
  day: number;
  title: string;
  reason: string;
  factors: string[];
  founderProceeds: number;
}

export interface ScenarioState {
  id: string;
  objectiveText: string;
  deadlineDay: number | null;
  progress: number; // 0..1
  complete: boolean;
  failed: boolean;
}

// ---------------------------------------------------------------- month accumulation & reports

export type OpexCategory =
  | 'salaries' | 'marketing' | 'rent' | 'rd' | 'tools' | 'recruiting' | 'legal' | 'security'
  | 'carrying' | 'warranty' | 'maintenance' | 'severance' | 'utilities' | 'compliance' | 'esg'
  | 'integration' | 'writeoffs' | 'bad_debt' | 'implementation' | 'fees' | 'other';

export type CogsCategory = 'materials' | 'labor' | 'hosting' | 'fulfillment' | 'payment_fees' | 'partner_share' | 'energy';

export type CashFlowKind = 'operating' | 'investing' | 'financing';

export interface FunnelCounts {
  inMarket: number;
  aware: number;
  interest: number;
  visit: number;
  consideration: number;
  trial: number;
  purchase: number;
  activation: number;
  referral: number;
  churn: number;
  expansion: number;
}

export interface MonthAccumulator {
  revenue: number;
  revenueByProduct: Record<Id, number>;
  revenueByMarket: Record<Id, number>;
  revenueBySegment: Record<string, number>;
  revenueByStream: Record<string, number>;
  refunds: number;
  cogs: Record<CogsCategory, number>;
  opex: Record<OpexCategory, number>;
  salaryByDept: Record<string, number>;
  depreciation: number;
  interest: number;
  otherIncome: number;
  tax: number;
  cashFlows: Record<CashFlowKind, Record<string, number>>;
  beginCash: number;
  units: number;
  lostUnits: number;
  newCustomers: number;
  newByChannel: Record<string, number>;
  newBySegment: Record<string, number>;
  churned: number;
  churnBase: number; // customer-days exposure / days for churn rate
  marketingSpend: Record<string, number>;
  salesCost: number;
  funnel: FunnelCounts;
  tickets: number;
  ticketCapacity: number;
  produced: number;
  defects: number;
  returns: number;
  hires: number;
  quits: number;
  layoffs: number;
  priceWeighted: number; // Σ realized price × units, for avg price
  demandIndex: number; // Σ in-market buyers
  awarenessAvg: number;
  choiceShare: number; // avg conditional choice probability
  choiceSamples: number;
  stockoutDays: number;
  slaBreaches: number;
  seatsExpansion: number;
  /** Weighted driver accumulators for explainability, e.g. 'churn.satisfaction'. */
  drv: Record<string, number>;
}

export interface IncomeStatement {
  revenue: number;
  refunds: number;
  netRevenue: number;
  cogs: number;
  cogsBreakdown: Record<CogsCategory, number>;
  grossProfit: number;
  opex: Record<OpexCategory, number>;
  totalOpex: number;
  ebitda: number;
  depreciation: number;
  ebit: number;
  interest: number;
  otherIncome: number;
  ebt: number;
  tax: number;
  netIncome: number;
}

export interface BalanceSheet {
  cash: number;
  receivables: number;
  inventory: number;
  ppe: number;
  goodwill: number;
  totalAssets: number;
  payables: number;
  accrued: number;
  taxPayable: number;
  deferredRevenue: number;
  debt: number;
  overdraft: number;
  totalLiabilities: number;
  paidInCapital: number;
  retainedEarnings: number;
  treasuryStock: number;
  equity: number;
}

export interface CashFlowStatement {
  beginCash: number;
  operating: number;
  investing: number;
  financing: number;
  net: number;
  endCash: number;
  items: Record<CashFlowKind, Record<string, number>>;
}

export interface Kpis {
  revenue: number;
  runRate: number; // annualized
  growthMoM: number;
  grossMargin: number;
  netIncome: number;
  ebitda: number;
  burn: number; // net cash outflow per month (positive = burning)
  runwayMonths: number; // Infinity if not burning
  cash: number;
  customers: number;
  newCustomers: number;
  churned: number;
  churnRate: number;
  cac: number;
  ltv: number;
  arpu: number;
  paybackMonths: number;
  contributionMargin: number;
  marketShare: number;
  valuation: number;
  employees: number;
  productivity: number;
  morale: number;
  inventoryValue: number;
  inventoryUnits: number;
  stockoutDays: number;
  satisfaction: number;
  brand: number;
  pipelineValue: number;
  responseHours: number;
  stockPrice: number;
  freeUsers: number;
  avgPrice: number;
  units: number;
  lostUnits: number;
  debt: number;
  headcountCost: number;
  marketingSpend: number;
  pmf: number;
  esg: number;
}

export interface DriverFactor {
  label: string;
  value: number; // contribution (absolute in metric units or %)
  detail?: string;
}

export interface MonthlyReport {
  index: number;
  year: number;
  month: number; // 1..12
  endDay: number;
  income: IncomeStatement;
  balance: BalanceSheet;
  cashflow: CashFlowStatement;
  kpis: Kpis;
  funnel: FunnelCounts;
  breakdown: {
    revenueByProduct: Record<Id, number>;
    revenueByMarket: Record<Id, number>;
    revenueBySegment: Record<string, number>;
    customersByProduct: Record<Id, number>;
    customersByMarket: Record<Id, number>;
    customersBySegment: Record<string, number>;
    newByChannel: Record<string, number>;
    spendByChannel: Record<string, number>;
    headcountByDept: Record<string, number>;
    salaryByDept: Record<string, number>;
    competitorShare: Record<Id, number>;
    competitorRevenue: Record<Id, number>;
  };
  drivers: Record<string, DriverFactor[]>;
  macro: { phase: MacroPhase; gdpGrowth: number; inflation: number; interestRate: number; unemployment: number; consumerConfidence: number; businessConfidence: number; marketIndex: number };
  insights: Insight[];
}

export interface OpsMetrics {
  responseHours: number;
  reliability: number; // 0..100
  fillRate: Record<Id, number>;
  serviceUtilization: number;
  serviceCapacity: number; // units / month
  outageDays: number;
  securityScore: number; // 0..100
  engineeringCapacity: number; // dev points / month
  researchCapacity: number; // research points / month
  valuation: number;
  valuationDrivers: DriverFactor[];
  marketShare: number;
  revenueRunRate: number;
  learningUnits: Record<Id, number>; // cumulative units produced / sold for learning-curve cost
  officeUtilization: number;
  warehouseUtilization: number;
}

export interface SimState {
  schemaVersion: number;
  runId: string;
  seed: number;
  rng: RngState;
  day: number; // days since start date
  startYear: number;
  startMonth: number; // 1..12
  config: GameConfig;
  status: 'running' | 'ended';
  outcome: Outcome | null;
  company: CompanyState;
  products: Product[];
  cells: Record<string, CustomerCell>;
  markets: MarketState[];
  marketing: MarketingState;
  sales: SalesState;
  contracts: Contract[];
  partnerships: Partnership[];
  experiments: Experiment[];
  employees: Employee[];
  openings: JobOpening[];
  pendingHires: PendingHire[];
  departments: Record<DeptId, DepartmentState>;
  inventory: Record<Id, InventoryState>;
  suppliers: Supplier[];
  orders: PurchaseOrder[];
  factories: Factory[];
  facilities: Facility[];
  finance: FinanceState;
  loans: Loan[];
  capTable: Shareholder[];
  rounds: FundingRound[];
  raise: ActiveRaise | null;
  board: BoardState;
  stock: StockState | null;
  ipo: IpoProcess | null;
  competitors: Competitor[];
  macro: MacroState;
  modifiers: Modifier[];
  events: EventRecord[];
  news: NewsItem[];
  decisions: Decision[];
  negotiations: Negotiation[];
  legalCases: LegalCase[];
  tech: TechState;
  research: ResearchState;
  security: SecurityState;
  esg: EsgState;
  reports: MonthlyReport[];
  month: MonthAccumulator;
  alerts: Alert[];
  achievements: Record<string, number>;
  scenario: ScenarioState | null;
  metrics: OpsMetrics;
  counters: { nextId: number };
  flags: Record<string, number | boolean | string>;
  log: string[]; // engine diagnostics (validation corrections)
}

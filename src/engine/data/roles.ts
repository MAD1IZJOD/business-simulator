import type { DeptId, ManagementStyle, RoleId } from '../types';

export interface RoleDef {
  id: RoleId;
  name: string;
  dept: DeptId;
  baseSalary: number; // INR / month at level 2, labor index 1
  description: string;
  hireable: boolean;
}

export const ROLES: Record<RoleId, RoleDef> = {
  founder: { id: 'founder', name: 'Founder & CEO', dept: 'executive', baseSalary: 0, description: 'Does a bit of everything early on.', hireable: false },
  engineer: { id: 'engineer', name: 'Software engineer', dept: 'engineering', baseSalary: 120000, description: 'Builds and maintains products. Drives development speed and quality.', hireable: true },
  data_scientist: { id: 'data_scientist', name: 'Data scientist', dept: 'engineering', baseSalary: 140000, description: 'Improves analytics, AI features and forecasting.', hireable: true },
  product_manager: { id: 'product_manager', name: 'Product manager', dept: 'product', baseSalary: 150000, description: 'Makes engineering effort count. One PM per ~6 engineers.', hireable: true },
  designer: { id: 'designer', name: 'Product designer', dept: 'product', baseSalary: 90000, description: 'Raises product quality and conversion.', hireable: true },
  sdr: { id: 'sdr', name: 'Sales development rep', dept: 'sales', baseSalary: 45000, description: 'Prospects and qualifies business leads.', hireable: true },
  account_executive: { id: 'account_executive', name: 'Account executive', dept: 'sales', baseSalary: 95000, description: 'Runs proposals and negotiations to close deals.', hireable: true },
  account_manager: { id: 'account_manager', name: 'Account manager', dept: 'sales', baseSalary: 80000, description: 'Grows and retains existing business accounts.', hireable: true },
  marketer: { id: 'marketer', name: 'Marketer', dept: 'marketing', baseSalary: 80000, description: 'Deploys marketing budget effectively. Budget per marketer beyond ~₹6L/month loses efficiency.', hireable: true },
  finance_analyst: { id: 'finance_analyst', name: 'Finance analyst', dept: 'finance', baseSalary: 85000, description: 'Speeds collections, improves forecasting and is required for fundraising and IPO readiness.', hireable: true },
  recruiter: { id: 'recruiter', name: 'Recruiter / HR', dept: 'hr', baseSalary: 60000, description: 'Speeds up hiring and lifts morale. One per ~40 employees.', hireable: true },
  ops_associate: { id: 'ops_associate', name: 'Operations associate', dept: 'operations', baseSalary: 35000, description: 'Runs warehouses, logistics and day-to-day operations.', hireable: true },
  production_worker: { id: 'production_worker', name: 'Production worker', dept: 'operations', baseSalary: 22000, description: 'Staffs factory lines. Each line needs a crew.', hireable: true },
  specialist: { id: 'specialist', name: 'Service specialist', dept: 'operations', baseSalary: 60000, description: 'Delivers the service to customers (industry-specific role).', hireable: true },
  lawyer: { id: 'lawyer', name: 'Legal counsel', dept: 'legal', baseSalary: 150000, description: 'Reduces legal and regulatory risk, improves contract outcomes.', hireable: true },
  security_engineer: { id: 'security_engineer', name: 'Security engineer', dept: 'security', baseSalary: 150000, description: 'Reduces vulnerability to cyberattacks.', hireable: true },
  support_agent: { id: 'support_agent', name: 'Support agent', dept: 'customer_success', baseSalary: 30000, description: 'Answers tickets. Handles ~450 tickets a month.', hireable: true },
  cs_manager: { id: 'cs_manager', name: 'Customer success manager', dept: 'customer_success', baseSalary: 75000, description: 'Onboards and retains customers, reduces churn for business accounts.', hireable: true },
  researcher: { id: 'researcher', name: 'Researcher', dept: 'research', baseSalary: 160000, description: 'Generates research points for R&D projects and technology.', hireable: true },
};

export const HIREABLE_ROLES = Object.values(ROLES).filter((r) => r.hireable);

export const LEVEL_SALARY = [0, 0.7, 1, 1.4, 1.9, 2.6];
export const LEVEL_NAMES = ['', 'Junior', 'Mid', 'Senior', 'Lead', 'Principal'];
export const LEVEL_SKILL = [0, 38, 52, 64, 74, 83];

export const DEPARTMENTS: { id: DeptId; name: string; description: string }[] = [
  { id: 'executive', name: 'Executive', description: 'Founders and leadership.' },
  { id: 'engineering', name: 'Engineering', description: 'Builds products and infrastructure.' },
  { id: 'product', name: 'Product', description: 'Product management and design.' },
  { id: 'sales', name: 'Sales', description: 'Prospecting, closing and account management.' },
  { id: 'marketing', name: 'Marketing', description: 'Runs campaigns and brand.' },
  { id: 'finance', name: 'Finance', description: 'Accounting, collections, fundraising support.' },
  { id: 'hr', name: 'HR', description: 'Recruiting and people operations.' },
  { id: 'operations', name: 'Operations', description: 'Production, fulfillment and service delivery.' },
  { id: 'legal', name: 'Legal', description: 'Contracts, compliance and disputes.' },
  { id: 'security', name: 'Security', description: 'Protects systems and data.' },
  { id: 'customer_success', name: 'Customer Success', description: 'Support and retention.' },
  { id: 'research', name: 'Research', description: 'R&D and technology.' },
];

export interface ManagementStyleDef {
  id: ManagementStyle;
  name: string;
  description: string;
  marketingEff: number;
  hiringSpeed: number;
  burnout: number; // monthly burnout pressure
  morale: number; // morale target shift
  productivity: number;
  attrition: number;
  rdEff: number;
  qualityBonus: number;
  benefitsCost: number; // extra payroll share
  opexEff: number; // multiplier on department budgets needed
  culture: Partial<Record<'innovation' | 'discipline' | 'collaboration' | 'riskTolerance' | 'executionSpeed', number>>;
}

export const MANAGEMENT_STYLES: Record<ManagementStyle, ManagementStyleDef> = {
  aggressive_growth: {
    id: 'aggressive_growth', name: 'Aggressive growth', description: 'Push hard on sales, marketing and hiring. Faster growth, more burnout.',
    marketingEff: 1.1, hiringSpeed: 1.25, burnout: 4, morale: -5, productivity: 1.05, attrition: 1.2, rdEff: 1, qualityBonus: -2, benefitsCost: 0, opexEff: 1,
    culture: { executionSpeed: 75, riskTolerance: 75, discipline: 40, collaboration: 45, innovation: 55 },
  },
  balanced: {
    id: 'balanced', name: 'Balanced', description: 'Steady execution without extremes.',
    marketingEff: 1, hiringSpeed: 1, burnout: 0, morale: 0, productivity: 1, attrition: 1, rdEff: 1, qualityBonus: 0, benefitsCost: 0, opexEff: 1,
    culture: { executionSpeed: 55, riskTolerance: 50, discipline: 55, collaboration: 60, innovation: 50 },
  },
  efficiency: {
    id: 'efficiency', name: 'Efficiency focused', description: 'Tight cost control and process. Lower costs, lower morale and innovation.',
    marketingEff: 1.03, hiringSpeed: 0.85, burnout: 1.5, morale: -4, productivity: 1.07, attrition: 1.1, rdEff: 0.85, qualityBonus: 1, benefitsCost: 0, opexEff: 0.85,
    culture: { executionSpeed: 60, riskTolerance: 30, discipline: 80, collaboration: 50, innovation: 35 },
  },
  employee_focused: {
    id: 'employee_focused', name: 'Employee focused', description: 'Invest in people. Higher morale and retention, slightly higher costs.',
    marketingEff: 1, hiringSpeed: 1.1, burnout: -3, morale: 9, productivity: 0.98, attrition: 0.7, rdEff: 1.02, qualityBonus: 1, benefitsCost: 0.05, opexEff: 1.05,
    culture: { executionSpeed: 50, riskTolerance: 45, discipline: 50, collaboration: 80, innovation: 55 },
  },
  innovation: {
    id: 'innovation', name: 'Innovation focused', description: 'Prioritise R&D and product excellence. Better products, slower execution.',
    marketingEff: 0.95, hiringSpeed: 1, burnout: 1, morale: 3, productivity: 0.98, attrition: 0.95, rdEff: 1.25, qualityBonus: 4, benefitsCost: 0.02, opexEff: 1.05,
    culture: { executionSpeed: 45, riskTolerance: 70, discipline: 40, collaboration: 65, innovation: 85 },
  },
};

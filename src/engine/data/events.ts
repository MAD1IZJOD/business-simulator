// Declarative random-event definitions. The event engine evaluates conditions,
// scales probabilities from simulation state and applies the effects.
import type { EventCategory, IndustryId, ModifierTarget, RecessionKind } from '../types';

export type EventEffect =
  | { type: 'modifier'; target: ModifierTarget; value: number; days: number; scope?: 'supplier' | null; label?: string }
  | { type: 'cash'; revenueMonths?: number; fixed?: number; label: string }
  | { type: 'brand'; delta: number }
  | { type: 'reputation'; key: 'customer' | 'employer' | 'investor' | 'regulatory'; delta: number }
  | { type: 'awareness'; mult: number }
  | { type: 'supplier_bankrupt' }
  | { type: 'supplier_disrupt'; days: number }
  | { type: 'competitor_fail' }
  | { type: 'competitor_boost' }
  | { type: 'lose_customers'; pct: number }
  | { type: 'recession'; kind: RecessionKind; severity: number }
  | { type: 'boom' }
  | { type: 'satisfaction'; delta: number }
  | { type: 'morale'; delta: number }
  | { type: 'security_incident' }
  | { type: 'legal_case'; kind: 'lawsuit' | 'contract_dispute' | 'ip_dispute' | 'regulatory' | 'employment'; exposureMonths: number }
  | { type: 'decision'; kind: string }
  | { type: 'fx_shock'; pct: number }
  | { type: 'tech_discount' }
  | { type: 'inventory_damage'; pct: number };

export type EventScale =
  | 'vulnerability' | 'size' | 'low_quality' | 'high_quality' | 'low_satisfaction' | 'high_satisfaction'
  | 'low_morale' | 'regulation' | 'suppliers_risk' | 'brand' | 'layoffs' | 'none';

export interface EventDef {
  id: string;
  title: string;
  description: string;
  category: EventCategory;
  sentiment: 'positive' | 'negative' | 'neutral';
  monthlyProbability: number;
  scale: EventScale;
  requires: {
    physical?: boolean;
    digital?: boolean;
    launched?: boolean;
    suppliers?: boolean;
    competitors?: boolean;
    minCustomers?: number;
    minEmployees?: number;
    industries?: IndustryId[];
    notIndustries?: IndustryId[];
    phase?: ('expansion' | 'boom' | 'slowdown' | 'recession' | 'recovery')[];
  };
  effects: EventEffect[];
  cooldownDays: number;
}

export const EVENTS: EventDef[] = [
  {
    id: 'supplier_bankruptcy', title: '{supplier} goes bankrupt', description: 'A supplier has collapsed. Open orders with them are lost and you must source elsewhere.',
    category: 'operations', sentiment: 'negative', monthlyProbability: 0.012, scale: 'suppliers_risk', requires: { physical: true, suppliers: true },
    effects: [{ type: 'supplier_bankrupt' }], cooldownDays: 365,
  },
  {
    id: 'viral_product', title: '{product} goes viral', description: 'A post about your product blew up online. Awareness is surging.',
    category: 'customers', sentiment: 'positive', monthlyProbability: 0.012, scale: 'high_quality', requires: { launched: true },
    effects: [{ type: 'awareness', mult: 1.6 }, { type: 'modifier', target: 'demand', value: 1.35, days: 45, label: 'Viral moment' }, { type: 'brand', delta: 3 }, { type: 'decision', kind: 'viral_moment' }], cooldownDays: 240,
  },
  {
    id: 'negative_review', title: 'Scathing review of {product} spreads', description: 'An influential reviewer tore your product apart and it is circulating widely.',
    category: 'customers', sentiment: 'negative', monthlyProbability: 0.015, scale: 'low_quality', requires: { launched: true },
    effects: [{ type: 'brand', delta: -4 }, { type: 'modifier', target: 'conversion', value: 0.85, days: 60, label: 'Bad review' }, { type: 'reputation', key: 'customer', delta: -5 }], cooldownDays: 150,
  },
  {
    id: 'positive_review', title: 'Glowing press coverage for {product}', description: 'A major publication named your product a standout in its category.',
    category: 'customers', sentiment: 'positive', monthlyProbability: 0.015, scale: 'high_satisfaction', requires: { launched: true },
    effects: [{ type: 'brand', delta: 4 }, { type: 'modifier', target: 'conversion', value: 1.12, days: 60, label: 'Great press' }, { type: 'reputation', key: 'customer', delta: 4 }], cooldownDays: 150,
  },
  {
    id: 'competitor_failure', title: '{competitor} runs into trouble', description: 'A rival is struggling badly — its customers are shopping around.',
    category: 'competition', sentiment: 'positive', monthlyProbability: 0.008, scale: 'none', requires: { competitors: true },
    effects: [{ type: 'competitor_fail' }], cooldownDays: 365,
  },
  {
    id: 'competitor_breakthrough', title: '{competitor} unveils a breakthrough', description: 'A rival shipped something impressive. Expect pressure on your sales.',
    category: 'competition', sentiment: 'negative', monthlyProbability: 0.012, scale: 'none', requires: { competitors: true },
    effects: [{ type: 'competitor_boost' }], cooldownDays: 200,
  },
  {
    id: 'regulatory_change', title: 'New regulations for {industry}', description: 'Regulators introduced new compliance requirements. Compliance costs rise.',
    category: 'legal', sentiment: 'negative', monthlyProbability: 0.012, scale: 'regulation', requires: {},
    effects: [{ type: 'modifier', target: 'compliance_cost', value: 1.6, days: 540, label: 'New regulation' }, { type: 'reputation', key: 'regulatory', delta: -3 }], cooldownDays: 400,
  },
  {
    id: 'cyberattack', title: '{company} hit by a cyberattack', description: 'Attackers breached your systems. Recovery is costly and customers are rattled.',
    category: 'security', sentiment: 'negative', monthlyProbability: 0.01, scale: 'vulnerability', requires: { minCustomers: 50 },
    effects: [{ type: 'security_incident' }], cooldownDays: 180,
  },
  {
    id: 'employee_lawsuit', title: 'Former employee sues {company}', description: 'A wrongful-termination and harassment claim has been filed.',
    category: 'legal', sentiment: 'negative', monthlyProbability: 0.006, scale: 'layoffs', requires: { minEmployees: 10 },
    effects: [{ type: 'legal_case', kind: 'employment', exposureMonths: 0.6 }, { type: 'reputation', key: 'employer', delta: -4 }], cooldownDays: 240,
  },
  {
    id: 'celebrity_endorsement', title: 'A celebrity wants to endorse {product}', description: 'A well-known personality loves your product and is open to a paid endorsement.',
    category: 'customers', sentiment: 'positive', monthlyProbability: 0.01, scale: 'brand', requires: { launched: true, notIndustries: ['manufacturing', 'energy', 'cybersecurity', 'consulting'] },
    effects: [{ type: 'decision', kind: 'celebrity' }], cooldownDays: 300,
  },
  {
    id: 'logistics_disruption', title: 'Port congestion disrupts logistics', description: 'Shipping delays ripple across supply chains. Lead times are much longer.',
    category: 'operations', sentiment: 'negative', monthlyProbability: 0.012, scale: 'none', requires: { physical: true },
    effects: [{ type: 'modifier', target: 'lead_time', value: 1.8, days: 75, label: 'Logistics disruption' }], cooldownDays: 240,
  },
  {
    id: 'material_shortage', title: 'Raw material shortage', description: 'A global shortage pushes material costs up and limits supplier capacity.',
    category: 'operations', sentiment: 'negative', monthlyProbability: 0.01, scale: 'none', requires: { physical: true },
    effects: [{ type: 'modifier', target: 'material_cost', value: 1.3, days: 120, label: 'Material shortage' }, { type: 'modifier', target: 'supplier_capacity', value: 0.6, days: 90, label: 'Material shortage' }], cooldownDays: 300,
  },
  {
    id: 'new_technology', title: 'New technology slashes implementation costs', description: 'A breakthrough makes your next technology upgrade much cheaper.',
    category: 'product', sentiment: 'positive', monthlyProbability: 0.01, scale: 'none', requires: {},
    effects: [{ type: 'tech_discount' }], cooldownDays: 365,
  },
  {
    id: 'patent_troll', title: 'Patent infringement claim against {company}', description: 'A patent holder claims your product infringes their IP.',
    category: 'legal', sentiment: 'negative', monthlyProbability: 0.006, scale: 'size', requires: { launched: true },
    effects: [{ type: 'legal_case', kind: 'ip_dispute', exposureMonths: 1.5 }], cooldownDays: 365,
  },
  {
    id: 'demand_spike', title: 'Unexpected demand spike', description: 'A shift in the market sends buyers looking for exactly what you sell.',
    category: 'market', sentiment: 'positive', monthlyProbability: 0.012, scale: 'none', requires: { launched: true },
    effects: [{ type: 'modifier', target: 'demand', value: 1.4, days: 40, label: 'Demand spike' }], cooldownDays: 200,
  },
  {
    id: 'data_center_outage', title: 'Major outage takes {product} offline', description: 'An infrastructure failure caused hours of downtime.',
    category: 'operations', sentiment: 'negative', monthlyProbability: 0.012, scale: 'low_quality', requires: { digital: true, launched: true },
    effects: [{ type: 'modifier', target: 'outage', value: 1.8, days: 20, label: 'Outage' }, { type: 'satisfaction', delta: -6 }, { type: 'reputation', key: 'customer', delta: -3 }], cooldownDays: 120,
  },
  {
    id: 'key_employee_poached', title: 'A competitor is poaching your best people', description: 'A rival has made an offer to one of your senior employees.',
    category: 'people', sentiment: 'negative', monthlyProbability: 0.02, scale: 'low_morale', requires: { minEmployees: 6 },
    effects: [{ type: 'decision', kind: 'key_employee' }], cooldownDays: 120,
  },
  {
    id: 'tax_audit', title: 'Tax authorities open an audit', description: 'Auditors are reviewing your filings. Professional fees and a possible penalty apply.',
    category: 'finance', sentiment: 'negative', monthlyProbability: 0.005, scale: 'size', requires: {},
    effects: [{ type: 'cash', revenueMonths: 0.15, fixed: 200000, label: 'Tax audit fees & penalty' }], cooldownDays: 540,
  },
  {
    id: 'currency_shock', title: 'Rupee swings sharply', description: 'Currency markets are volatile. International revenue and costs move with it.',
    category: 'macro', sentiment: 'neutral', monthlyProbability: 0.012, scale: 'none', requires: {},
    effects: [{ type: 'fx_shock', pct: 0.08 }], cooldownDays: 180,
  },
  {
    id: 'warehouse_flood', title: 'Monsoon flooding damages a warehouse', description: 'Water damage destroyed part of your stock.',
    category: 'operations', sentiment: 'negative', monthlyProbability: 0.006, scale: 'none', requires: { physical: true },
    effects: [{ type: 'inventory_damage', pct: 0.2 }], cooldownDays: 365,
  },
  {
    id: 'talent_boom', title: 'Talent market heats up', description: 'Everyone is hiring. Salaries rise and candidates are scarce.',
    category: 'people', sentiment: 'negative', monthlyProbability: 0.02, scale: 'none', requires: { phase: ['boom', 'expansion'] },
    effects: [{ type: 'modifier', target: 'wage', value: 1.08, days: 365, label: 'Talent war' }, { type: 'modifier', target: 'hiring_speed', value: 0.7, days: 180, label: 'Talent war' }], cooldownDays: 365,
  },
  {
    id: 'funding_frenzy', title: 'Investors pile into {industry}', description: 'A hot funding market: valuations and appetite are up.',
    category: 'finance', sentiment: 'positive', monthlyProbability: 0.01, scale: 'none', requires: { phase: ['boom', 'expansion', 'recovery'] },
    effects: [{ type: 'modifier', target: 'funding', value: 1.3, days: 180, label: 'Funding frenzy' }], cooldownDays: 365,
  },
  {
    id: 'sudden_recession', title: 'Financial shock triggers a downturn', description: 'A sudden credit event tips the economy into recession.',
    category: 'macro', sentiment: 'negative', monthlyProbability: 0.004, scale: 'none', requires: { phase: ['expansion', 'boom', 'slowdown'] },
    effects: [{ type: 'recession', kind: 'financial', severity: 0.7 }], cooldownDays: 720,
  },
];

export const EVENT_BY_ID: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

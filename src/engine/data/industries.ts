import type { Fulfillment, IndustryId, Monetization, SegmentId } from '../types';

export interface IndustryDef {
  id: IndustryId;
  name: string;
  glyph: string;
  description: string;
  fulfillment: Fulfillment;
  /** Reference list price in INR (India, mainstream consumer, price level 1). */
  basePrice: number;
  priceUnit: string;
  /** For take-rate monetizations: typical take rate in % and GMV per unit. */
  takeRate: number;
  gmvPerUnit: number;
  /** Advertising revenue per active user per month at ad load 5 (India). */
  adArpu: number;
  priceIncomeExp: number;
  unitCostRatio: number;
  materialShare: number;
  defaultMonetization: Monetization;
  monetizations: Monetization[];
  purchaseFreq: number;
  baseChurn: number;
  adoption: Partial<Record<SegmentId, number>>;
  propensity: number;
  growth: number;
  capitalIntensity: number;
  regulation: number;
  complexity: number;
  competition: number;
  cyclicality: number;
  rateSensitivity: number;
  devEffort: number;
  devMonthsBase: number;
  growthMonths: number;
  maturityMonths: number;
  obsolescence: number;
  ticketsPerCustomer: number;
  cyberExposure: number;
  perishability: number;
  emissionsPerUnit: number;
  multiple: number;
  competitorMargin: number;
  categories: string[];
  specialistLabel: string;
  specialistSalary: number;
  serviceCapacity: number;
  requiresStores: boolean;
  networkEffect: number;
  shippingRatio: number;
  returnRate: number;
  b2bScale: number;
  seasonAmp: number;
  peakMonth: number;
  complianceCostPerMonth: number;
  startingProduct: { name: string; quality: number; features: number };
  competitorNames: string[];
}

const I = (d: IndustryDef) => d;

export const INDUSTRIES: Record<IndustryId, IndustryDef> = {
  saas: I({
    id: 'saas', name: 'SaaS', glyph: '☁', description: 'Cloud software sold per seat. High gross margins, recurring revenue, long-term retention matters most.',
    fulfillment: 'digital', basePrice: 800, priceUnit: 'per seat / month', takeRate: 0, gmvPerUnit: 0, adArpu: 0,
    priceIncomeExp: 0.35, unitCostRatio: 0.12, materialShare: 0, defaultMonetization: 'subscription',
    monetizations: ['subscription', 'freemium', 'enterprise', 'usage', 'licensing'], purchaseFreq: 1, baseChurn: 0.03,
    adoption: { smb: 0.22, enterprise: 0.35, government: 0.12, consumers: 0.01, students: 0.02 }, propensity: 0.03,
    growth: 0.18, capitalIntensity: 0.1, regulation: 0.2, complexity: 0.3, competition: 0.7, cyclicality: 0.5,
    rateSensitivity: 0.9, devEffort: 14, devMonthsBase: 4, growthMonths: 18, maturityMonths: 42, obsolescence: 0.012,
    ticketsPerCustomer: 0.25, cyberExposure: 0.7, perishability: 0, emissionsPerUnit: 0.2, multiple: 6,
    competitorMargin: 0.75, categories: ['CRM', 'Project management', 'HR platform', 'Accounting', 'Analytics'],
    specialistLabel: 'Implementation specialist', specialistSalary: 90000, serviceCapacity: 0, requiresStores: false,
    networkEffect: 0.1, shippingRatio: 0, returnRate: 0, b2bScale: 1, seasonAmp: 0.04, peakMonth: 3,
    complianceCostPerMonth: 15000, startingProduct: { name: 'Flowdesk', quality: 55, features: 40 },
    competitorNames: ['Stackly', 'CloudPeak', 'Zentrix', 'OrbitHQ', 'Workvine', 'Nimbus Suite'],
  }),
  ai: I({
    id: 'ai', name: 'Artificial Intelligence', glyph: '◈', description: 'AI products with heavy compute costs, fast-moving technology and aggressive competition.',
    fulfillment: 'digital', basePrice: 1500, priceUnit: 'per seat / month', takeRate: 0, gmvPerUnit: 0, adArpu: 0,
    priceIncomeExp: 0.3, unitCostRatio: 0.32, materialShare: 0, defaultMonetization: 'usage',
    monetizations: ['usage', 'subscription', 'freemium', 'enterprise', 'licensing'], purchaseFreq: 1, baseChurn: 0.035,
    adoption: { smb: 0.18, enterprise: 0.4, government: 0.08, consumers: 0.03, students: 0.04 }, propensity: 0.045,
    growth: 0.38, capitalIntensity: 0.25, regulation: 0.35, complexity: 0.45, competition: 0.85, cyclicality: 0.4,
    rateSensitivity: 1.1, devEffort: 22, devMonthsBase: 6, growthMonths: 10, maturityMonths: 24, obsolescence: 0.03,
    ticketsPerCustomer: 0.3, cyberExposure: 0.75, perishability: 0, emissionsPerUnit: 1.2, multiple: 10,
    competitorMargin: 0.55, categories: ['AI assistant', 'Vision API', 'Forecasting engine', 'Voice AI', 'Agent platform'],
    specialistLabel: 'ML ops engineer', specialistSalary: 150000, serviceCapacity: 0, requiresStores: false,
    networkEffect: 0.15, shippingRatio: 0, returnRate: 0, b2bScale: 1, seasonAmp: 0.02, peakMonth: 3,
    complianceCostPerMonth: 30000, startingProduct: { name: 'Cortex', quality: 55, features: 35 },
    competitorNames: ['NeuralForge', 'Synthia', 'DeepVale', 'Axiom AI', 'Promptly', 'Tensorworks'],
  }),
  electronics: I({
    id: 'electronics', name: 'Consumer Electronics', glyph: '⌁', description: 'Physical devices built in factories. Big launches, thin margins, inventory and supply chains decide winners.',
    fulfillment: 'manufactured', basePrice: 15000, priceUnit: 'per device', takeRate: 0, gmvPerUnit: 0, adArpu: 0,
    priceIncomeExp: 0.45, unitCostRatio: 0.6, materialShare: 0.75, defaultMonetization: 'one_time',
    monetizations: ['one_time', 'subscription'], purchaseFreq: 0.04, baseChurn: 0.03,
    adoption: { consumers: 0.12, students: 0.14, budget: 0.08, luxury: 0.22, smb: 0.04 }, propensity: 0.025,
    growth: 0.08, capitalIntensity: 0.8, regulation: 0.3, complexity: 0.8, competition: 0.8, cyclicality: 1.2,
    rateSensitivity: 0.7, devEffort: 26, devMonthsBase: 8, growthMonths: 8, maturityMonths: 20, obsolescence: 0.04,
    ticketsPerCustomer: 0.08, cyberExposure: 0.4, perishability: 0.01, emissionsPerUnit: 40, multiple: 1.6,
    competitorMargin: 0.32, categories: ['Earbuds', 'Smartwatch', 'Smart speaker', 'Tablet', 'Action camera'],
    specialistLabel: 'Hardware technician', specialistSalary: 45000, serviceCapacity: 0, requiresStores: false,
    networkEffect: 0.05, shippingRatio: 0.03, returnRate: 0.06, b2bScale: 0.2, seasonAmp: 0.25, peakMonth: 10,
    complianceCostPerMonth: 20000, startingProduct: { name: 'Pulse One', quality: 55, features: 45 },
    competitorNames: ['Voltic', 'Nexa Devices', 'Lumina', 'Boltware', 'Kinetic Labs', 'Aurion'],
  }),
  ecommerce: I({
    id: 'ecommerce', name: 'E-commerce', glyph: '⇄', description: 'Online store selling sourced goods. Customer acquisition cost, inventory turns and repeat purchases rule.',
    fulfillment: 'inventory', basePrice: 900, priceUnit: 'per order', takeRate: 12, gmvPerUnit: 900, adArpu: 0,
    priceIncomeExp: 0.55, unitCostRatio: 0.66, materialShare: 1, defaultMonetization: 'one_time',
    monetizations: ['one_time', 'marketplace', 'subscription', 'commission'], purchaseFreq: 1, baseChurn: 0.06,
    adoption: { consumers: 0.28, budget: 0.3, students: 0.3, luxury: 0.12 }, propensity: 0.06,
    growth: 0.2, capitalIntensity: 0.35, regulation: 0.25, complexity: 0.55, competition: 0.85, cyclicality: 0.9,
    rateSensitivity: 0.6, devEffort: 10, devMonthsBase: 3, growthMonths: 12, maturityMonths: 36, obsolescence: 0.015,
    ticketsPerCustomer: 0.12, cyberExposure: 0.55, perishability: 0.02, emissionsPerUnit: 3, multiple: 1.8,
    competitorMargin: 0.3, categories: ['Home goods store', 'Beauty store', 'Gadget store', 'Grocery delivery', 'Pet supplies'],
    specialistLabel: 'Fulfillment associate', specialistSalary: 28000, serviceCapacity: 0, requiresStores: false,
    networkEffect: 0.1, shippingRatio: 0.08, returnRate: 0.1, b2bScale: 0.3, seasonAmp: 0.22, peakMonth: 10,
    complianceCostPerMonth: 10000, startingProduct: { name: 'Basketly', quality: 52, features: 45 },
    competitorNames: ['CartNation', 'ShopSphere', 'Kartify', 'Dealvine', 'Bazaarly', 'QuickCrate'],
  }),
  retail: I({
    id: 'retail', name: 'Retail', glyph: '▤', description: 'Physical stores selling sourced goods. Store footprint limits sales; rent and inventory tie up cash.',
    fulfillment: 'inventory', basePrice: 600, priceUnit: 'per basket', takeRate: 0, gmvPerUnit: 0, adArpu: 0,
    priceIncomeExp: 0.6, unitCostRatio: 0.7, materialShare: 1, defaultMonetization: 'one_time',
    monetizations: ['one_time', 'subscription'], purchaseFreq: 2, baseChurn: 0.05,
    adoption: { consumers: 0.35, budget: 0.4, students: 0.25, luxury: 0.1 }, propensity: 0.08,
    growth: 0.07, capitalIntensity: 0.55, regulation: 0.3, complexity: 0.6, competition: 0.75, cyclicality: 0.8,
    rateSensitivity: 0.5, devEffort: 6, devMonthsBase: 2, growthMonths: 12, maturityMonths: 60, obsolescence: 0.008,
    ticketsPerCustomer: 0.03, cyberExposure: 0.3, perishability: 0.03, emissionsPerUnit: 2, multiple: 0.9,
    competitorMargin: 0.28, categories: ['Convenience store', 'Home store', 'Sports store', 'Books & stationery', 'Organic grocer'],
    specialistLabel: 'Store associate', specialistSalary: 22000, serviceCapacity: 0, requiresStores: true,
    networkEffect: 0, shippingRatio: 0.01, returnRate: 0.04, b2bScale: 0.2, seasonAmp: 0.2, peakMonth: 10,
    complianceCostPerMonth: 12000, startingProduct: { name: 'Corner Co.', quality: 55, features: 50 },
    competitorNames: ['MegaMart', 'DailyNeeds', 'UrbanBasket', 'ValueCity', 'StoreLine', 'FreshWay'],
  }),
  manufacturing: I({
    id: 'manufacturing', name: 'Industrial Manufacturing', glyph: '⚙', description: 'B2B components made in factories. Capacity, machine maintenance and large accounts matter.',
    fulfillment: 'manufactured', basePrice: 25000, priceUnit: 'per unit', takeRate: 0, gmvPerUnit: 0, adArpu: 0,
    priceIncomeExp: 0.3, unitCostRatio: 0.66, materialShare: 0.7, defaultMonetization: 'one_time',
    monetizations: ['one_time', 'enterprise', 'licensing'], purchaseFreq: 0.6, baseChurn: 0.02,
    adoption: { smb: 0.06, enterprise: 0.25, government: 0.12 }, propensity: 0.03,
    growth: 0.06, capitalIntensity: 1, regulation: 0.45, complexity: 0.85, competition: 0.55, cyclicality: 1.3,
    rateSensitivity: 1, devEffort: 20, devMonthsBase: 6, growthMonths: 12, maturityMonths: 72, obsolescence: 0.006,
    ticketsPerCustomer: 0.4, cyberExposure: 0.35, perishability: 0.002, emissionsPerUnit: 120, multiple: 1.2,
    competitorMargin: 0.26, categories: ['Precision parts', 'Industrial pumps', 'Motors', 'Sensors', 'Packaging machinery'],
    specialistLabel: 'Field engineer', specialistSalary: 60000, serviceCapacity: 0, requiresStores: false,
    networkEffect: 0, shippingRatio: 0.04, returnRate: 0.02, b2bScale: 0.5, seasonAmp: 0.06, peakMonth: 2,
    complianceCostPerMonth: 35000, startingProduct: { name: 'Titan Drive', quality: 55, features: 45 },
    competitorNames: ['Forgeline', 'IronPeak', 'Precisa', 'Mechanix', 'Steelwood', 'Axleworks'],
  }),
  food: I({
    id: 'food', name: 'Packaged Food', glyph: '❁', description: 'FMCG food made in plants. Perishable inventory, fierce shelf competition and frequent repeat buying.',
    fulfillment: 'manufactured', basePrice: 150, priceUnit: 'per pack', takeRate: 0, gmvPerUnit: 0, adArpu: 0,
    priceIncomeExp: 0.55, unitCostRatio: 0.52, materialShare: 0.7, defaultMonetization: 'one_time',
    monetizations: ['one_time', 'subscription'], purchaseFreq: 5, baseChurn: 0.08,
    adoption: { consumers: 0.45, budget: 0.45, students: 0.45, luxury: 0.2 }, propensity: 0.1,
    growth: 0.08, capitalIntensity: 0.6, regulation: 0.6, complexity: 0.65, competition: 0.8, cyclicality: 0.2,
    rateSensitivity: 0.4, devEffort: 6, devMonthsBase: 3, growthMonths: 10, maturityMonths: 48, obsolescence: 0.01,
    ticketsPerCustomer: 0.01, cyberExposure: 0.2, perishability: 0.15, emissionsPerUnit: 0.6, multiple: 1.4,
    competitorMargin: 0.35, categories: ['Protein snacks', 'Instant meals', 'Cold brew', 'Millet cereal', 'Sauces'],
    specialistLabel: 'Food technologist', specialistSalary: 50000, serviceCapacity: 0, requiresStores: false,
    networkEffect: 0, shippingRatio: 0.06, returnRate: 0.01, b2bScale: 0.3, seasonAmp: 0.1, peakMonth: 10,
    complianceCostPerMonth: 25000, startingProduct: { name: 'Crunchy Oats', quality: 55, features: 45 },
    competitorNames: ['NutriCo', 'Harvest Foods', 'Tastebud', 'GreenPlate', 'Spice Route', 'Morningfield'],
  }),
  restaurants: I({
    id: 'restaurants', name: 'Restaurants', glyph: '♨', description: 'Outlets serving meals. Each outlet caps capacity; staff, rent and food costs squeeze margins.',
    fulfillment: 'service', basePrice: 450, priceUnit: 'per meal', takeRate: 0, gmvPerUnit: 0, adArpu: 0,
    priceIncomeExp: 0.6, unitCostRatio: 0.34, materialShare: 1, defaultMonetization: 'one_time',
    monetizations: ['one_time', 'subscription'], purchaseFreq: 1.6, baseChurn: 0.1,
    adoption: { consumers: 0.3, students: 0.32, budget: 0.2, luxury: 0.25 }, propensity: 0.1,
    growth: 0.1, capitalIntensity: 0.5, regulation: 0.5, complexity: 0.6, competition: 0.85, cyclicality: 0.9,
    rateSensitivity: 0.4, devEffort: 3, devMonthsBase: 2, growthMonths: 8, maturityMonths: 36, obsolescence: 0.015,
    ticketsPerCustomer: 0.02, cyberExposure: 0.15, perishability: 0, emissionsPerUnit: 1.5, multiple: 1.1,
    competitorMargin: 0.3, categories: ['Casual dining', 'Cloud kitchen', 'Cafe', 'Fine dining', 'Quick service'],
    specialistLabel: 'Chef', specialistSalary: 32000, serviceCapacity: 900, requiresStores: true,
    networkEffect: 0, shippingRatio: 0, returnRate: 0, b2bScale: 0.1, seasonAmp: 0.12, peakMonth: 12,
    complianceCostPerMonth: 15000, startingProduct: { name: 'Tandoor House', quality: 58, features: 50 },
    competitorNames: ['Spice Garden', 'Urban Tadka', 'The Daily Bowl', 'Grill Nation', 'Masala Street', 'Cafe Aroma'],
  }),
  logistics: I({
    id: 'logistics', name: 'Logistics', glyph: '⛟', description: 'Delivery and freight services. Fleet capacity, reliability and fuel costs drive the business.',
    fulfillment: 'service', basePrice: 140, priceUnit: 'per shipment', takeRate: 0, gmvPerUnit: 0, adArpu: 0,
    priceIncomeExp: 0.45, unitCostRatio: 0.55, materialShare: 0, defaultMonetization: 'usage',
    monetizations: ['usage', 'one_time', 'enterprise', 'subscription'], purchaseFreq: 20, baseChurn: 0.035,
    adoption: { smb: 0.2, enterprise: 0.3, consumers: 0.05, government: 0.05 }, propensity: 0.035,
    growth: 0.12, capitalIntensity: 0.6, regulation: 0.4, complexity: 0.75, competition: 0.75, cyclicality: 1.1,
    rateSensitivity: 0.7, devEffort: 8, devMonthsBase: 3, growthMonths: 12, maturityMonths: 60, obsolescence: 0.006,
    ticketsPerCustomer: 0.5, cyberExposure: 0.35, perishability: 0, emissionsPerUnit: 4, multiple: 1.3,
    competitorMargin: 0.2, categories: ['Same-day delivery', 'Freight network', 'Cold chain', 'Warehousing', 'Last-mile'],
    specialistLabel: 'Driver', specialistSalary: 26000, serviceCapacity: 1500, requiresStores: false,
    networkEffect: 0.2, shippingRatio: 0, returnRate: 0, b2bScale: 1, seasonAmp: 0.15, peakMonth: 10,
    complianceCostPerMonth: 20000, startingProduct: { name: 'SwiftRoute', quality: 55, features: 45 },
    competitorNames: ['CargoLink', 'Dashway', 'RoadRunner', 'ShipFast', 'TransIndia', 'Parcelio'],
  }),
  healthcare: I({
    id: 'healthcare', name: 'Healthcare', glyph: '✚', description: 'Clinics and care services. Heavy regulation, clinician capacity and trust dominate.',
    fulfillment: 'service', basePrice: 900, priceUnit: 'per visit', takeRate: 0, gmvPerUnit: 0, adArpu: 0,
    priceIncomeExp: 0.55, unitCostRatio: 0.35, materialShare: 0.5, defaultMonetization: 'one_time',
    monetizations: ['one_time', 'subscription', 'enterprise'], purchaseFreq: 0.5, baseChurn: 0.035,
    adoption: { consumers: 0.25, luxury: 0.3, budget: 0.18, students: 0.1, government: 0.1, enterprise: 0.1 }, propensity: 0.05,
    growth: 0.11, capitalIntensity: 0.55, regulation: 0.95, complexity: 0.7, competition: 0.55, cyclicality: -0.1,
    rateSensitivity: 0.3, devEffort: 8, devMonthsBase: 4, growthMonths: 18, maturityMonths: 72, obsolescence: 0.005,
    ticketsPerCustomer: 0.15, cyberExposure: 0.8, perishability: 0, emissionsPerUnit: 2, multiple: 2.5,
    competitorMargin: 0.3, categories: ['Primary care clinic', 'Diagnostics', 'Telehealth', 'Dental chain', 'Physiotherapy'],
    specialistLabel: 'Clinician', specialistSalary: 120000, serviceCapacity: 320, requiresStores: true,
    networkEffect: 0, shippingRatio: 0, returnRate: 0, b2bScale: 0.5, seasonAmp: 0.08, peakMonth: 8,
    complianceCostPerMonth: 60000, startingProduct: { name: 'CareFirst', quality: 58, features: 45 },
    competitorNames: ['MediPoint', 'Aarogya Care', 'HealWell', 'Vitalis', 'CureNet', 'LifeLine Clinics'],
  }),
  fintech: I({
    id: 'fintech', name: 'Fintech', glyph: '₹', description: 'Payments and financial services earning a fee on volume. Regulation, trust and security are existential.',
    fulfillment: 'digital', basePrice: 1.8, priceUnit: '% of payment volume', takeRate: 1.8, gmvPerUnit: 20000, adArpu: 0,
    priceIncomeExp: 0, unitCostRatio: 0.35, materialShare: 0, defaultMonetization: 'transaction_fee',
    monetizations: ['transaction_fee', 'subscription', 'freemium', 'commission', 'enterprise'], purchaseFreq: 1, baseChurn: 0.03,
    adoption: { consumers: 0.12, students: 0.12, budget: 0.1, luxury: 0.15, smb: 0.2, enterprise: 0.12 }, propensity: 0.035,
    growth: 0.24, capitalIntensity: 0.3, regulation: 0.9, complexity: 0.55, competition: 0.8, cyclicality: 0.6,
    rateSensitivity: 1.2, devEffort: 16, devMonthsBase: 5, growthMonths: 14, maturityMonths: 48, obsolescence: 0.01,
    ticketsPerCustomer: 0.1, cyberExposure: 1, perishability: 0, emissionsPerUnit: 0.1, multiple: 5,
    competitorMargin: 0.5, categories: ['Payments app', 'Business payments', 'Lending platform', 'Wealth app', 'Expense cards'],
    specialistLabel: 'Risk analyst', specialistSalary: 90000, serviceCapacity: 0, requiresStores: false,
    networkEffect: 0.35, shippingRatio: 0, returnRate: 0, b2bScale: 3, seasonAmp: 0.08, peakMonth: 10,
    complianceCostPerMonth: 80000, startingProduct: { name: 'PayRail', quality: 55, features: 40 },
    competitorNames: ['PayNexus', 'Rupeeflow', 'Ledgerly', 'CoinVault', 'SettleUp', 'FinBridge'],
  }),
  education: I({
    id: 'education', name: 'Education', glyph: '✎', description: 'Learning products. Seasonal demand, students are price-sensitive, outcomes drive referrals.',
    fulfillment: 'digital', basePrice: 1200, priceUnit: 'per learner / month', takeRate: 0, gmvPerUnit: 0, adArpu: 0,
    priceIncomeExp: 0.5, unitCostRatio: 0.2, materialShare: 0, defaultMonetization: 'subscription',
    monetizations: ['subscription', 'freemium', 'one_time', 'enterprise', 'advertising'], purchaseFreq: 1, baseChurn: 0.07,
    adoption: { students: 0.25, consumers: 0.05, budget: 0.04, government: 0.08, smb: 0.03, enterprise: 0.06 }, propensity: 0.05,
    growth: 0.12, capitalIntensity: 0.15, regulation: 0.35, complexity: 0.35, competition: 0.75, cyclicality: -0.3,
    rateSensitivity: 0.5, devEffort: 10, devMonthsBase: 4, growthMonths: 12, maturityMonths: 36, obsolescence: 0.012,
    ticketsPerCustomer: 0.15, cyberExposure: 0.45, perishability: 0, emissionsPerUnit: 0.1, multiple: 3,
    competitorMargin: 0.6, categories: ['Test prep', 'Coding bootcamp', 'Language app', 'K-12 tutoring', 'Upskilling'],
    specialistLabel: 'Instructor', specialistSalary: 60000, serviceCapacity: 0, requiresStores: false,
    networkEffect: 0.15, shippingRatio: 0, returnRate: 0, b2bScale: 0.8, seasonAmp: 0.3, peakMonth: 6,
    complianceCostPerMonth: 10000, startingProduct: { name: 'LearnLoop', quality: 55, features: 45 },
    competitorNames: ['Byteways', 'EduNova', 'Classmate+', 'Skillset', 'Tutorly', 'BrainBridge'],
  }),
  gaming: I({
    id: 'gaming', name: 'Gaming', glyph: '♠', description: 'Hit-driven games. Freemium economics, network effects and short product lifecycles.',
    fulfillment: 'digital', basePrice: 300, priceUnit: 'per player / month', takeRate: 0, gmvPerUnit: 0, adArpu: 15,
    priceIncomeExp: 0.4, unitCostRatio: 0.15, materialShare: 0, defaultMonetization: 'freemium',
    monetizations: ['freemium', 'one_time', 'subscription', 'advertising'], purchaseFreq: 1, baseChurn: 0.1,
    adoption: { students: 0.45, consumers: 0.22, budget: 0.18, luxury: 0.1 }, propensity: 0.07,
    growth: 0.15, capitalIntensity: 0.2, regulation: 0.25, complexity: 0.35, competition: 0.9, cyclicality: 0.3,
    rateSensitivity: 0.6, devEffort: 18, devMonthsBase: 6, growthMonths: 5, maturityMonths: 14, obsolescence: 0.06,
    ticketsPerCustomer: 0.05, cyberExposure: 0.45, perishability: 0, emissionsPerUnit: 0.2, multiple: 3.5,
    competitorMargin: 0.6, categories: ['Battle arena', 'Puzzle game', 'Racing game', 'Card game', 'Survival sim'],
    specialistLabel: 'Game designer', specialistSalary: 90000, serviceCapacity: 0, requiresStores: false,
    networkEffect: 0.45, shippingRatio: 0, returnRate: 0, b2bScale: 0.1, seasonAmp: 0.15, peakMonth: 12,
    complianceCostPerMonth: 8000, startingProduct: { name: 'Skyrift', quality: 55, features: 40 },
    competitorNames: ['PixelStorm', 'Nebula Games', 'Rogue Studio', 'Arcadia', 'Moonshot Play', 'Kraken Interactive'],
  }),
  media: I({
    id: 'media', name: 'Media', glyph: '▶', description: 'Content platforms monetized by ads or subscriptions. Audience scale and engagement are everything.',
    fulfillment: 'digital', basePrice: 199, priceUnit: 'per member / month', takeRate: 0, gmvPerUnit: 0, adArpu: 40,
    priceIncomeExp: 0.4, unitCostRatio: 0.3, materialShare: 0, defaultMonetization: 'advertising',
    monetizations: ['advertising', 'subscription', 'freemium'], purchaseFreq: 1, baseChurn: 0.06,
    adoption: { consumers: 0.4, students: 0.45, budget: 0.35, luxury: 0.25 }, propensity: 0.06,
    growth: 0.1, capitalIntensity: 0.2, regulation: 0.35, complexity: 0.35, competition: 0.85, cyclicality: 0.9,
    rateSensitivity: 0.6, devEffort: 10, devMonthsBase: 3, growthMonths: 10, maturityMonths: 30, obsolescence: 0.02,
    ticketsPerCustomer: 0.01, cyberExposure: 0.4, perishability: 0, emissionsPerUnit: 0.05, multiple: 2.5,
    competitorMargin: 0.45, categories: ['News app', 'Video platform', 'Podcast network', 'Creator platform', 'Streaming'],
    specialistLabel: 'Content producer', specialistSalary: 55000, serviceCapacity: 0, requiresStores: false,
    networkEffect: 0.35, shippingRatio: 0, returnRate: 0, b2bScale: 0.1, seasonAmp: 0.1, peakMonth: 11,
    complianceCostPerMonth: 12000, startingProduct: { name: 'Streamline', quality: 55, features: 40 },
    competitorNames: ['Voxcast', 'ClipHub', 'Headline Daily', 'Tunewave', 'ReelNation', 'Signal Media'],
  }),
  automotive: I({
    id: 'automotive', name: 'Automotive', glyph: '⛭', description: 'Vehicles built in capital-hungry plants. Huge tickets, long development, brutal capital requirements.',
    fulfillment: 'manufactured', basePrice: 900000, priceUnit: 'per vehicle', takeRate: 0, gmvPerUnit: 0, adArpu: 0,
    priceIncomeExp: 0.5, unitCostRatio: 0.78, materialShare: 0.8, defaultMonetization: 'one_time',
    monetizations: ['one_time', 'subscription'], purchaseFreq: 0.005, baseChurn: 0.015,
    adoption: { consumers: 0.02, luxury: 0.08, smb: 0.02, government: 0.02, enterprise: 0.03 }, propensity: 0.012,
    growth: 0.07, capitalIntensity: 1, regulation: 0.8, complexity: 0.95, competition: 0.6, cyclicality: 1.5,
    rateSensitivity: 1.4, devEffort: 60, devMonthsBase: 14, growthMonths: 18, maturityMonths: 60, obsolescence: 0.012,
    ticketsPerCustomer: 0.1, cyberExposure: 0.5, perishability: 0.005, emissionsPerUnit: 6000, multiple: 1.2,
    competitorMargin: 0.18, categories: ['Electric scooter', 'City EV', 'Electric SUV', 'Delivery van', 'Electric bus'],
    specialistLabel: 'Automotive engineer', specialistSalary: 90000, serviceCapacity: 0, requiresStores: false,
    networkEffect: 0.05, shippingRatio: 0.02, returnRate: 0.01, b2bScale: 0.2, seasonAmp: 0.18, peakMonth: 10,
    complianceCostPerMonth: 120000, startingProduct: { name: 'Volt S1', quality: 55, features: 45 },
    competitorNames: ['Evolt Motors', 'Ranger Auto', 'Zippa EV', 'Motorwerk', 'Gridline Motors', 'Sparq'],
  }),
  fashion: I({
    id: 'fashion', name: 'Fashion', glyph: '✂', description: 'Apparel sourced from suppliers. Trends fade fast, returns are high, brand is pricing power.',
    fulfillment: 'inventory', basePrice: 1800, priceUnit: 'per item', takeRate: 0, gmvPerUnit: 0, adArpu: 0,
    priceIncomeExp: 0.6, unitCostRatio: 0.42, materialShare: 1, defaultMonetization: 'one_time',
    monetizations: ['one_time', 'subscription', 'marketplace'], purchaseFreq: 0.45, baseChurn: 0.07,
    adoption: { consumers: 0.28, students: 0.3, budget: 0.2, luxury: 0.35 }, propensity: 0.07,
    growth: 0.09, capitalIntensity: 0.4, regulation: 0.2, complexity: 0.55, competition: 0.85, cyclicality: 1,
    rateSensitivity: 0.5, devEffort: 5, devMonthsBase: 2, growthMonths: 5, maturityMonths: 12, obsolescence: 0.05,
    ticketsPerCustomer: 0.08, cyberExposure: 0.3, perishability: 0.04, emissionsPerUnit: 8, multiple: 1.6,
    competitorMargin: 0.5, categories: ['Streetwear', 'Ethnic wear', 'Athleisure', 'Formal wear', 'Footwear'],
    specialistLabel: 'Merchandiser', specialistSalary: 40000, serviceCapacity: 0, requiresStores: false,
    networkEffect: 0.05, shippingRatio: 0.07, returnRate: 0.16, b2bScale: 0.2, seasonAmp: 0.28, peakMonth: 10,
    complianceCostPerMonth: 8000, startingProduct: { name: 'Loom & Thread', quality: 55, features: 50 },
    competitorNames: ['Threadline', 'Vogue Street', 'Kurta Co.', 'Stitchwise', 'Urban Loom', 'Mode Nine'],
  }),
  realestate: I({
    id: 'realestate', name: 'Real Estate Services', glyph: '⌂', description: 'Property management and brokerage earning commissions on property value. Highly rate-sensitive.',
    fulfillment: 'service', basePrice: 8, priceUnit: '% commission on rent managed', takeRate: 8, gmvPerUnit: 35000, adArpu: 0,
    priceIncomeExp: 0, unitCostRatio: 0.4, materialShare: 0, defaultMonetization: 'commission',
    monetizations: ['commission', 'subscription', 'marketplace'],
    purchaseFreq: 1, baseChurn: 0.025,
    adoption: { consumers: 0.04, luxury: 0.12, smb: 0.05, enterprise: 0.06 }, propensity: 0.03,
    growth: 0.07, capitalIntensity: 0.4, regulation: 0.6, complexity: 0.5, competition: 0.7, cyclicality: 1.2,
    rateSensitivity: 1.6, devEffort: 6, devMonthsBase: 3, growthMonths: 18, maturityMonths: 72, obsolescence: 0.005,
    ticketsPerCustomer: 0.35, cyberExposure: 0.3, perishability: 0, emissionsPerUnit: 1, multiple: 2,
    competitorMargin: 0.3, categories: ['Rental management', 'Brokerage', 'Co-living', 'Commercial leasing', 'Property tech'],
    specialistLabel: 'Property manager', specialistSalary: 45000, serviceCapacity: 120, requiresStores: false,
    networkEffect: 0.2, shippingRatio: 0, returnRate: 0, b2bScale: 0.5, seasonAmp: 0.1, peakMonth: 4,
    complianceCostPerMonth: 25000, startingProduct: { name: 'NestKeep', quality: 55, features: 45 },
    competitorNames: ['Homely', 'KeyStone Realty', 'Brickwise', 'Squarefoot Pro', 'Tenantly', 'PrimeNest'],
  }),
  energy: I({
    id: 'energy', name: 'Energy', glyph: 'ϟ', description: 'Clean power generation sold on long contracts. Massive capex, regulated tariffs, stable demand.',
    fulfillment: 'manufactured', basePrice: 2500, priceUnit: 'per connection / month', takeRate: 0, gmvPerUnit: 0, adArpu: 0,
    priceIncomeExp: 0.5, unitCostRatio: 0.62, materialShare: 0.3, defaultMonetization: 'subscription',
    monetizations: ['subscription', 'enterprise', 'usage'], purchaseFreq: 1, baseChurn: 0.012,
    adoption: { consumers: 0.12, luxury: 0.2, smb: 0.15, enterprise: 0.3, government: 0.25 }, propensity: 0.02,
    growth: 0.12, capitalIntensity: 1, regulation: 0.8, complexity: 0.8, competition: 0.5, cyclicality: 0.3,
    rateSensitivity: 1.5, devEffort: 20, devMonthsBase: 8, growthMonths: 24, maturityMonths: 120, obsolescence: 0.004,
    ticketsPerCustomer: 0.08, cyberExposure: 0.6, perishability: 0.9, emissionsPerUnit: 50, multiple: 2.2,
    competitorMargin: 0.3, categories: ['Rooftop solar', 'Community solar', 'Battery storage', 'Wind PPA', 'EV charging'],
    specialistLabel: 'Grid technician', specialistSalary: 55000, serviceCapacity: 0, requiresStores: false,
    networkEffect: 0, shippingRatio: 0, returnRate: 0, b2bScale: 0.8, seasonAmp: 0.1, peakMonth: 5,
    complianceCostPerMonth: 90000, startingProduct: { name: 'SunGrid', quality: 55, features: 45 },
    competitorNames: ['Solaris Power', 'GreenVolt', 'Windrush Energy', 'Photon Grid', 'Suryodaya Renewables', 'Aether Power'],
  }),
  consulting: I({
    id: 'consulting', name: 'Consulting', glyph: '◉', description: 'Professional services. Revenue scales with consultants; utilization, reputation and big clients decide profit.',
    fulfillment: 'service', basePrice: 300000, priceUnit: 'per engagement-month', takeRate: 0, gmvPerUnit: 0, adArpu: 0,
    priceIncomeExp: 0.4, unitCostRatio: 0.12, materialShare: 0, defaultMonetization: 'enterprise',
    monetizations: ['enterprise', 'subscription', 'one_time'], purchaseFreq: 1, baseChurn: 0.06,
    adoption: { smb: 0.02, enterprise: 0.35, government: 0.2 }, propensity: 0.03,
    growth: 0.08, capitalIntensity: 0.05, regulation: 0.2, complexity: 0.4, competition: 0.65, cyclicality: 0.8,
    rateSensitivity: 0.4, devEffort: 3, devMonthsBase: 1, growthMonths: 24, maturityMonths: 96, obsolescence: 0.004,
    ticketsPerCustomer: 0.5, cyberExposure: 0.3, perishability: 0, emissionsPerUnit: 1, multiple: 1.5,
    competitorMargin: 0.3, categories: ['Strategy advisory', 'Digital transformation', 'Operations consulting', 'Tax advisory', 'Data consulting'],
    specialistLabel: 'Consultant', specialistSalary: 130000, serviceCapacity: 1.1, requiresStores: false,
    networkEffect: 0, shippingRatio: 0, returnRate: 0, b2bScale: 0.02, seasonAmp: 0.06, peakMonth: 3,
    complianceCostPerMonth: 8000, startingProduct: { name: 'Northstar Advisory', quality: 58, features: 50 },
    competitorNames: ['Meridian Partners', 'Crestline Advisory', 'Banyan & Co', 'Summit Group', 'Keystone Consulting', 'Pinnacle Advisors'],
  }),
  cybersecurity: I({
    id: 'cybersecurity', name: 'Cybersecurity', glyph: '⛨', description: 'Security software for businesses. Reputation is everything; one breach can end you. Counter-cyclical demand.',
    fulfillment: 'digital', basePrice: 1400, priceUnit: 'per endpoint / month', takeRate: 0, gmvPerUnit: 0, adArpu: 0,
    priceIncomeExp: 0.3, unitCostRatio: 0.15, materialShare: 0, defaultMonetization: 'subscription',
    monetizations: ['subscription', 'enterprise', 'usage', 'licensing'], purchaseFreq: 1, baseChurn: 0.018,
    adoption: { smb: 0.18, enterprise: 0.5, government: 0.4 }, propensity: 0.03,
    growth: 0.2, capitalIntensity: 0.15, regulation: 0.45, complexity: 0.45, competition: 0.7, cyclicality: -0.1,
    rateSensitivity: 0.6, devEffort: 18, devMonthsBase: 5, growthMonths: 18, maturityMonths: 48, obsolescence: 0.015,
    ticketsPerCustomer: 0.3, cyberExposure: 0.9, perishability: 0, emissionsPerUnit: 0.1, multiple: 8,
    competitorMargin: 0.72, categories: ['Endpoint protection', 'Cloud firewall', 'Identity management', 'SIEM', 'Email security'],
    specialistLabel: 'Security analyst', specialistSalary: 110000, serviceCapacity: 0, requiresStores: false,
    networkEffect: 0.1, shippingRatio: 0, returnRate: 0, b2bScale: 1, seasonAmp: 0.05, peakMonth: 3,
    complianceCostPerMonth: 20000, startingProduct: { name: 'Sentinel', quality: 58, features: 40 },
    competitorNames: ['Fortalis', 'CipherWall', 'Guardline', 'ShieldOps', 'Bastion Labs', 'Vaultic'],
  }),
};

export const INDUSTRY_LIST: IndustryDef[] = Object.values(INDUSTRIES);

export function isPhysical(ind: IndustryDef): boolean {
  return ind.fulfillment === 'inventory' || ind.fulfillment === 'manufactured';
}

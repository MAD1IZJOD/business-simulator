import type { Audience, GtmChannel, Monetization } from '../types';

export type RevenueType = 'recurring' | 'transactional' | 'take_rate' | 'advertising';

export interface MonetizationDef {
  id: Monetization;
  name: string;
  description: string;
  revenueType: RevenueType;
  churnMult: number;
  trialMult: number; // multiplier on the trial funnel stage
  cacMult: number;
  expansionRate: number; // monthly ARPU expansion for healthy customers
  networkBoost: number; // extra network-effect strength
  salesLedBoost: number; // extra reliance on sales team for business segments
  freeTier: boolean;
  priceLabel: string;
  businessBias: number; // multiplier on business-segment demand
  consumerBias: number;
  macroSensitivity: number;
}

export const MONETIZATIONS: Record<Monetization, MonetizationDef> = {
  subscription: {
    id: 'subscription', name: 'Subscription', description: 'Customers pay every month. Revenue compounds when churn is low.',
    revenueType: 'recurring', churnMult: 1, trialMult: 1, cacMult: 1, expansionRate: 0.004, networkBoost: 0, salesLedBoost: 0,
    freeTier: false, priceLabel: 'Monthly price', businessBias: 1, consumerBias: 1, macroSensitivity: 0.8,
  },
  one_time: {
    id: 'one_time', name: 'One-time purchase', description: 'Customers pay per purchase and may come back to buy again.',
    revenueType: 'transactional', churnMult: 1, trialMult: 1.1, cacMult: 0.9, expansionRate: 0, networkBoost: 0, salesLedBoost: 0,
    freeTier: false, priceLabel: 'Unit price', businessBias: 1, consumerBias: 1, macroSensitivity: 1.1,
  },
  freemium: {
    id: 'freemium', name: 'Freemium', description: 'A free tier drives mass sign-ups; a share of free users upgrade to paid over time.',
    revenueType: 'recurring', churnMult: 1.1, trialMult: 3.2, cacMult: 0.55, expansionRate: 0.003, networkBoost: 0.1, salesLedBoost: 0,
    freeTier: true, priceLabel: 'Paid tier price / month', businessBias: 0.9, consumerBias: 1.2, macroSensitivity: 0.7,
  },
  marketplace: {
    id: 'marketplace', name: 'Marketplace', description: 'Connect buyers and sellers and take a cut of every transaction. Liquidity creates network effects.',
    revenueType: 'take_rate', churnMult: 0.95, trialMult: 1.3, cacMult: 0.9, expansionRate: 0.002, networkBoost: 0.45, salesLedBoost: 0,
    freeTier: false, priceLabel: 'Take rate %', businessBias: 1, consumerBias: 1, macroSensitivity: 1,
  },
  advertising: {
    id: 'advertising', name: 'Advertising', description: 'Free for users; advertisers pay for attention. More ads earn more but annoy users.',
    revenueType: 'advertising', churnMult: 1.05, trialMult: 3.5, cacMult: 0.5, expansionRate: 0, networkBoost: 0.25, salesLedBoost: 0,
    freeTier: false, priceLabel: 'Ad load (1–10)', businessBias: 0.2, consumerBias: 1.3, macroSensitivity: 1.3,
  },
  commission: {
    id: 'commission', name: 'Commission', description: 'Earn a percentage of the value you help transact.',
    revenueType: 'take_rate', churnMult: 1, trialMult: 1.2, cacMult: 0.9, expansionRate: 0.002, networkBoost: 0.2, salesLedBoost: 0.1,
    freeTier: false, priceLabel: 'Commission %', businessBias: 1, consumerBias: 1, macroSensitivity: 1.1,
  },
  licensing: {
    id: 'licensing', name: 'Licensing', description: 'License your technology or IP to other businesses for recurring fees. Few, sticky, large customers.',
    revenueType: 'recurring', churnMult: 0.6, trialMult: 0.8, cacMult: 1.5, expansionRate: 0.003, networkBoost: 0, salesLedBoost: 0.5,
    freeTier: false, priceLabel: 'License fee / unit / month', businessBias: 1.3, consumerBias: 0.1, macroSensitivity: 0.7,
  },
  enterprise: {
    id: 'enterprise', name: 'Enterprise contracts', description: 'Annual contracts negotiated by a sales team. Big deals, long cycles, concentration risk.',
    revenueType: 'recurring', churnMult: 0.5, trialMult: 0.9, cacMult: 1.3, expansionRate: 0.006, networkBoost: 0, salesLedBoost: 1,
    freeTier: false, priceLabel: 'Contract price / unit / month', businessBias: 1.4, consumerBias: 0.05, macroSensitivity: 0.8,
  },
  usage: {
    id: 'usage', name: 'Usage-based', description: 'Customers pay for what they use. Revenue expands with customer success — and shrinks in downturns.',
    revenueType: 'recurring', churnMult: 0.9, trialMult: 1.4, cacMult: 0.9, expansionRate: 0.012, networkBoost: 0, salesLedBoost: 0,
    freeTier: false, priceLabel: 'Price per usage unit', businessBias: 1.1, consumerBias: 0.9, macroSensitivity: 1.4,
  },
  transaction_fee: {
    id: 'transaction_fee', name: 'Transaction fees', description: 'Charge a small fee on each payment or transaction processed.',
    revenueType: 'take_rate', churnMult: 0.9, trialMult: 1.5, cacMult: 0.8, expansionRate: 0.004, networkBoost: 0.3, salesLedBoost: 0,
    freeTier: false, priceLabel: 'Fee %', businessBias: 1, consumerBias: 1, macroSensitivity: 1.1,
  },
};

export interface GtmDef {
  id: GtmChannel;
  name: string;
  description: string;
  priceRealization: number; // share of list price we actually receive
  reachBoost: number; // extra awareness from distribution partners
  cacMult: number;
  receivableDays: number;
  cogsShare: number; // share of unit cost we bear
  brandGain: number;
  qualityRisk: number;
}

export const GTM: Record<GtmChannel, GtmDef> = {
  dtc: { id: 'dtc', name: 'Direct-to-consumer', description: 'Sell directly online. Full margin, you pay for every customer.', priceRealization: 1, reachBoost: 0, cacMult: 1, receivableDays: 0, cogsShare: 1, brandGain: 1.1, qualityRisk: 0 },
  retail: { id: 'retail', name: 'Retail (own stores)', description: 'Sell through your own stores. Local presence lifts conversion; stores cap capacity.', priceRealization: 1, reachBoost: 0.15, cacMult: 0.85, receivableDays: 0, cogsShare: 1, brandGain: 1, qualityRisk: 0 },
  wholesale: { id: 'wholesale', name: 'Wholesale / distributors', description: 'Distributors resell your product. Wide reach and low CAC, but ~45% lower price and 60-day receivables.', priceRealization: 0.55, reachBoost: 0.6, cacMult: 0.45, receivableDays: 60, cogsShare: 1, brandGain: 0.6, qualityRisk: 0 },
  franchise: { id: 'franchise', name: 'Franchise', description: 'Franchisees run outlets and pay fees plus royalties. Capital-light, fast reach, weaker quality control.', priceRealization: 0.14, reachBoost: 0.8, cacMult: 0.35, receivableDays: 30, cogsShare: 0.05, brandGain: 0.8, qualityRisk: 0.15 },
};

export interface AudienceDef {
  id: Audience;
  name: string;
  description: string;
  business: number;
  consumer: number;
  partnerBoost: number;
}

export const AUDIENCES: Record<Audience, AudienceDef> = {
  b2b: { id: 'b2b', name: 'B2B', description: 'Sell to businesses and institutions.', business: 1, consumer: 0.15, partnerBoost: 0 },
  b2c: { id: 'b2c', name: 'B2C', description: 'Sell to individual consumers.', business: 0.2, consumer: 1, partnerBoost: 0 },
  b2b2c: { id: 'b2b2c', name: 'B2B2C', description: 'Reach consumers through business partners. Partnerships matter more.', business: 0.8, consumer: 0.8, partnerBoost: 0.35 },
};

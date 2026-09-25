import type { MarketingChannelId, SegmentId } from '../types';

export interface ChannelDef {
  id: MarketingChannelId;
  name: string;
  description: string;
  /** INR per person reached (India, income 1). 0 = not spend-driven. */
  costPerReach: number;
  maxReach: number; // max share of market population reachable per month
  quality: number; // intent quality → interest/consideration multiplier
  brandBuild: number; // contribution to brand target per reach
  stock: boolean; // builds an accumulating asset (SEO/content)
  staffDriven: boolean; // effectiveness depends on sales staff
  minEffective: number; // spend below this (INR/month) is mostly wasted
  affinity: Record<SegmentId, number>;
  scalability: 'low' | 'medium' | 'high';
}

const aff = (students: number, consumers: number, budget: number, luxury: number, smb: number, enterprise: number, government: number): Record<SegmentId, number> =>
  ({ students, consumers, budget, luxury, smb, enterprise, government });

export const CHANNELS: Record<MarketingChannelId, ChannelDef> = {
  seo: { id: 'seo', name: 'SEO', description: 'Slow to build, cheap at scale. Spend accumulates search authority that keeps paying off.', costPerReach: 0, maxReach: 0.07, quality: 1.25, brandBuild: 0.05, stock: true, staffDriven: false, minEffective: 0, affinity: aff(1.1, 1, 0.9, 0.8, 1, 0.7, 0.5), scalability: 'medium' },
  paid_search: { id: 'paid_search', name: 'Paid search', description: 'High-intent buyers, instant results, saturates quickly and gets expensive.', costPerReach: 3.2, maxReach: 0.05, quality: 1.4, brandBuild: 0.03, stock: false, staffDriven: false, minEffective: 0, affinity: aff(1, 1, 1, 0.9, 1, 0.6, 0.4), scalability: 'medium' },
  social: { id: 'social', name: 'Social media', description: 'Broad, cheap reach — great for young consumers, weak for enterprise.', costPerReach: 1.1, maxReach: 0.3, quality: 0.8, brandBuild: 0.15, stock: false, staffDriven: false, minEffective: 0, affinity: aff(1.5, 1.1, 0.9, 0.8, 0.5, 0.15, 0.1), scalability: 'high' },
  influencer: { id: 'influencer', name: 'Influencer marketing', description: 'Borrowed trust. Strong with students and consumers; volatile quality.', costPerReach: 1.6, maxReach: 0.16, quality: 1, brandBuild: 0.25, stock: false, staffDriven: false, minEffective: 50000, affinity: aff(1.6, 1.2, 0.7, 1.2, 0.3, 0.1, 0.05), scalability: 'medium' },
  tv: { id: 'tv', name: 'Television', description: 'Massive reach and brand building. Needs a big budget to register at all.', costPerReach: 0.45, maxReach: 0.55, quality: 0.5, brandBuild: 0.6, stock: false, staffDriven: false, minEffective: 2500000, affinity: aff(0.6, 1.2, 1.2, 0.8, 0.3, 0.2, 0.3), scalability: 'high' },
  radio: { id: 'radio', name: 'Radio', description: 'Cheap local reach, low intent. Works for mass-market and local businesses.', costPerReach: 0.4, maxReach: 0.2, quality: 0.45, brandBuild: 0.25, stock: false, staffDriven: false, minEffective: 300000, affinity: aff(0.4, 1, 1.1, 0.4, 0.6, 0.1, 0.2), scalability: 'medium' },
  email: { id: 'email', name: 'Email', description: 'Nurtures people who already know you. Tiny reach, high conversion, lowers churn slightly.', costPerReach: 0.3, maxReach: 0.03, quality: 1.6, brandBuild: 0.02, stock: false, staffDriven: false, minEffective: 0, affinity: aff(0.8, 1, 0.9, 0.9, 1.1, 0.8, 0.5), scalability: 'low' },
  events: { id: 'events', name: 'Events & conferences', description: 'Expensive per head but meets serious business buyers face to face.', costPerReach: 14, maxReach: 0.02, quality: 1.9, brandBuild: 0.3, stock: false, staffDriven: false, minEffective: 200000, affinity: aff(0.5, 0.3, 0.2, 0.8, 1.4, 2, 1.6), scalability: 'low' },
  partnerships: { id: 'partnerships', name: 'Co-marketing partnerships', description: 'Joint campaigns with partners. Credible reach into partner audiences.', costPerReach: 2.2, maxReach: 0.08, quality: 1.2, brandBuild: 0.15, stock: false, staffDriven: false, minEffective: 100000, affinity: aff(0.8, 0.9, 0.8, 1, 1.3, 1.1, 0.8), scalability: 'medium' },
  content: { id: 'content', name: 'Content marketing', description: 'Blogs, guides and videos that compound over time and educate buyers.', costPerReach: 0, maxReach: 0.05, quality: 1.15, brandBuild: 0.12, stock: true, staffDriven: false, minEffective: 0, affinity: aff(1.1, 0.9, 0.7, 0.9, 1.3, 1.1, 0.7), scalability: 'medium' },
  outbound: { id: 'outbound', name: 'Outbound prospecting', description: 'SDRs cold-call and email businesses. Needs SDRs; spend buys data and tooling.', costPerReach: 6, maxReach: 0.05, quality: 1.1, brandBuild: 0.02, stock: false, staffDriven: true, minEffective: 0, affinity: aff(0, 0.05, 0, 0.1, 1.3, 1.1, 0.8), scalability: 'low' },
  direct_sales: { id: 'direct_sales', name: 'Direct field sales', description: 'Account executives work named accounts. Expensive, slow, wins big deals.', costPerReach: 40, maxReach: 0.03, quality: 2.2, brandBuild: 0.05, stock: false, staffDriven: true, minEffective: 0, affinity: aff(0, 0, 0, 0.2, 0.8, 2, 1.8), scalability: 'low' },
  referral: { id: 'referral', name: 'Referral program', description: 'Reward customers for referrals. Paid per referred customer; strength depends on satisfaction.', costPerReach: 0, maxReach: 0, quality: 1.5, brandBuild: 0.05, stock: false, staffDriven: false, minEffective: 0, affinity: aff(1.4, 1.1, 1, 0.9, 1, 0.8, 0.3), scalability: 'medium' },
  affiliate: { id: 'affiliate', name: 'Affiliate marketing', description: 'Affiliates promote you for a commission on sales. Pay only for results.', costPerReach: 0, maxReach: 0.1, quality: 0.9, brandBuild: 0.02, stock: false, staffDriven: false, minEffective: 0, affinity: aff(1.2, 1.1, 1.2, 0.7, 0.6, 0.1, 0), scalability: 'high' },
};

export const CHANNEL_IDS = Object.keys(CHANNELS) as MarketingChannelId[];

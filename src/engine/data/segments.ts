import type { SegmentId } from '../types';

export interface SegmentDef {
  id: SegmentId;
  name: string;
  kind: 'consumer' | 'business';
  description: string;
  /** Consumers: share of population. Businesses: organisations per person. */
  density: number;
  priceSensitivity: number; // logit β on ln(price/reference)
  qualitySensitivity: number;
  brandSensitivity: number;
  churnMult: number; // lower = more loyal
  units: number; // seats / volume per customer (business)
  incomeMult: number; // reference price multiplier (willingness to pay)
  salesLed: boolean;
  salesCycleDays: number;
  reliabilityWeight: number;
  supportWeight: number;
  securityWeight: number;
  esgWeight: number;
  prestige: number; // luxury: higher price raises perceived value
  cacMult: number;
  ticketMult: number;
  paymentTermsDays: number;
}

export const SEGMENTS: Record<SegmentId, SegmentDef> = {
  students: {
    id: 'students', name: 'Students', kind: 'consumer', description: 'Young, digital-native, extremely price sensitive, loves referrals and social media.',
    density: 0.15, priceSensitivity: 3.2, qualitySensitivity: 0.7, brandSensitivity: 0.6, churnMult: 1.25, units: 1,
    incomeMult: 0.6, salesLed: false, salesCycleDays: 0, reliabilityWeight: 0.1, supportWeight: 0.1, securityWeight: 0,
    esgWeight: 0.5, prestige: 0, cacMult: 0.8, ticketMult: 0.8, paymentTermsDays: 0,
  },
  consumers: {
    id: 'consumers', name: 'Mainstream consumers', kind: 'consumer', description: 'The mass market. Balanced price and quality trade-offs, swayed by brand.',
    density: 0.45, priceSensitivity: 2.2, qualitySensitivity: 1, brandSensitivity: 0.9, churnMult: 1, units: 1,
    incomeMult: 1, salesLed: false, salesCycleDays: 0, reliabilityWeight: 0.2, supportWeight: 0.2, securityWeight: 0.1,
    esgWeight: 0.3, prestige: 0, cacMult: 1, ticketMult: 1, paymentTermsDays: 0,
  },
  budget: {
    id: 'budget', name: 'Budget shoppers', kind: 'consumer', description: 'Buys the cheapest acceptable option. Very high price sensitivity, low loyalty.',
    density: 0.3, priceSensitivity: 3.8, qualitySensitivity: 0.5, brandSensitivity: 0.4, churnMult: 1.35, units: 1,
    incomeMult: 0.5, salesLed: false, salesCycleDays: 0, reliabilityWeight: 0.1, supportWeight: 0.1, securityWeight: 0,
    esgWeight: 0.1, prestige: 0, cacMult: 0.9, ticketMult: 0.9, paymentTermsDays: 0,
  },
  luxury: {
    id: 'luxury', name: 'Premium & luxury', kind: 'consumer', description: 'Affluent buyers. Quality and brand dominate; a higher price can even signal value.',
    density: 0.03, priceSensitivity: 0.7, qualitySensitivity: 1.7, brandSensitivity: 1.6, churnMult: 0.7, units: 1,
    incomeMult: 3.5, salesLed: false, salesCycleDays: 0, reliabilityWeight: 0.5, supportWeight: 0.6, securityWeight: 0.2,
    esgWeight: 0.6, prestige: 0.45, cacMult: 1.6, ticketMult: 1.3, paymentTermsDays: 0,
  },
  smb: {
    id: 'smb', name: 'Small & medium businesses', kind: 'business', description: 'Owner-led businesses. Value-conscious, short sales cycles, need decent support.',
    density: 0.04, priceSensitivity: 1.9, qualitySensitivity: 1, brandSensitivity: 0.8, churnMult: 1, units: 8,
    incomeMult: 1, salesLed: false, salesCycleDays: 21, reliabilityWeight: 0.5, supportWeight: 0.6, securityWeight: 0.3,
    esgWeight: 0.2, prestige: 0, cacMult: 1.3, ticketMult: 1.5, paymentTermsDays: 30,
  },
  enterprise: {
    id: 'enterprise', name: 'Enterprises', kind: 'business', description: 'Large companies. Care about reliability, support, security and reputation more than price. Long sales cycles.',
    density: 0.00005, priceSensitivity: 0.9, qualitySensitivity: 1.3, brandSensitivity: 1.2, churnMult: 0.5, units: 150,
    incomeMult: 1.3, salesLed: true, salesCycleDays: 90, reliabilityWeight: 1.2, supportWeight: 1, securityWeight: 1.2,
    esgWeight: 0.4, prestige: 0, cacMult: 3, ticketMult: 4, paymentTermsDays: 60,
  },
  government: {
    id: 'government', name: 'Government', kind: 'business', description: 'Public agencies. Slow procurement, strict compliance and security, sticky once won.',
    density: 0.00002, priceSensitivity: 1.4, qualitySensitivity: 1, brandSensitivity: 1, churnMult: 0.4, units: 100,
    incomeMult: 1.1, salesLed: true, salesCycleDays: 150, reliabilityWeight: 1, supportWeight: 0.8, securityWeight: 1.4,
    esgWeight: 0.8, prestige: 0, cacMult: 3.5, ticketMult: 3, paymentTermsDays: 90,
  },
};

export const SEGMENT_IDS = Object.keys(SEGMENTS) as SegmentId[];

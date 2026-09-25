import type { TechTrack } from '../types';

export interface TechDef {
  id: TechTrack;
  name: string;
  description: string;
  effects: string[];
  baseCost: number; // INR for level 1; each level ×2.2
  months: number; // implementation time per level
  researchPoints: number; // research points required per level (×level)
}

export const TECHNOLOGIES: Record<TechTrack, TechDef> = {
  automation: { id: 'automation', name: 'Automation', description: 'Workflow and process automation across operations.', effects: ['+6% operations productivity per level', '-4% fulfillment cost per level'], baseCost: 1500000, months: 2, researchPoints: 4 },
  ai: { id: 'ai', name: 'Applied AI', description: 'AI in support, sales and product.', effects: ['Deflects 8% of support tickets per level', '+4% sales productivity per level', '+1.5 product quality per level'], baseCost: 2500000, months: 3, researchPoints: 6 },
  analytics: { id: 'analytics', name: 'Analytics & BI', description: 'Data warehouse, attribution and experimentation tooling.', effects: ['+4% marketing efficiency per level', 'Sharper competitor intelligence and A/B test precision'], baseCost: 1200000, months: 2, researchPoints: 3 },
  manufacturing: { id: 'manufacturing', name: 'Manufacturing tech', description: 'Robotics, quality control and process engineering.', effects: ['-12% defects per level', '+7% line throughput per level', '-6% energy per unit per level'], baseCost: 5000000, months: 4, researchPoints: 6 },
  cybersecurity: { id: 'cybersecurity', name: 'Cyber defense', description: 'Zero-trust architecture, monitoring and incident response.', effects: ['-12% vulnerability per level', 'Faster breach recovery'], baseCost: 1800000, months: 2, researchPoints: 4 },
  infrastructure: { id: 'infrastructure', name: 'Infrastructure', description: 'Scalable cloud and systems architecture.', effects: ['-8% hosting cost per level', '-15% outage risk per level', '+1 reliability per level'], baseCost: 2000000, months: 3, researchPoints: 4 },
};

export const TECH_IDS = Object.keys(TECHNOLOGIES) as TechTrack[];

export function techCost(track: TechTrack, level: number): number {
  return TECHNOLOGIES[track].baseCost * Math.pow(2.2, level - 1);
}

export function techPoints(track: TechTrack, level: number): number {
  return TECHNOLOGIES[track].researchPoints * level;
}

export interface ResearchDef {
  id: string;
  name: string;
  description: string;
  points: number;
  requires: string[];
  unlock: 'cost_reduction' | 'quality' | 'new_category' | 'market_access' | 'patentable' | 'process' | 'green';
  value: number;
}

export const RESEARCH_PROJECTS: ResearchDef[] = [
  { id: 'lean_process', name: 'Lean process engineering', description: 'Cuts variable unit costs by 8% on all products.', points: 10, requires: [], unlock: 'cost_reduction', value: 0.08 },
  { id: 'quality_systems', name: 'Quality systems', description: '+5 quality on all launched products and 20% fewer defects.', points: 12, requires: [], unlock: 'quality', value: 5 },
  { id: 'localization', name: 'Localization platform', description: 'Market entry costs 40% less and completes faster.', points: 10, requires: [], unlock: 'market_access', value: 0.4 },
  { id: 'novel_ip', name: 'Novel core technology', description: 'A patentable innovation: patents filed after this are much stronger.', points: 18, requires: ['quality_systems'], unlock: 'patentable', value: 0.35 },
  { id: 'next_gen', name: 'Next-generation platform', description: 'New products start with +10 quality and features.', points: 28, requires: ['novel_ip'], unlock: 'new_category', value: 10 },
  { id: 'advanced_materials', name: 'Advanced materials', description: 'Cuts variable unit costs by a further 12%.', points: 22, requires: ['lean_process'], unlock: 'cost_reduction', value: 0.12 },
  { id: 'green_ops', name: 'Green operations', description: 'Halves emissions per unit and cuts energy costs 15%.', points: 16, requires: ['lean_process'], unlock: 'green', value: 0.5 },
  { id: 'rapid_dev', name: 'Rapid development toolchain', description: 'Product development effort reduced by 25%.', points: 20, requires: ['quality_systems'], unlock: 'process', value: 0.25 },
];

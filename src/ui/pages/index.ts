import { lazy } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';
import type { PageId } from '../shell/nav';
import { Dashboard } from './Dashboard';

// The dashboard loads eagerly; other pages are split into their own chunks.
const page = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) => lazy(() => load().then((m) => ({ default: m[name] })));

export const PAGES: Record<PageId, ComponentType | LazyExoticComponent<ComponentType>> = {
  dashboard: Dashboard,
  decisions: page(() => import('./Decisions'), 'Decisions'),
  news: page(() => import('./News'), 'News'),
  products: page(() => import('./Products'), 'Products'),
  customers: page(() => import('./Customers'), 'Customers'),
  growth: page(() => import('./Growth'), 'Growth'),
  operations: page(() => import('./Operations'), 'Operations'),
  people: page(() => import('./People'), 'People'),
  finance: page(() => import('./Finance'), 'Finance'),
  capital: page(() => import('./Capital'), 'Capital'),
  markets: page(() => import('./Markets'), 'Markets'),
  competitors: page(() => import('./Competitors'), 'Competitors'),
  research: page(() => import('./Research'), 'Research'),
  strategy: page(() => import('./Strategy'), 'Strategy'),
  analytics: page(() => import('./Analytics'), 'Analytics'),
  settings: page(() => import('./Settings'), 'Settings'),
  learn: page(() => import('./Learn'), 'Learn'),
};

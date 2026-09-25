import type { ComponentType } from 'react';
import type { PageId } from '../shell/nav';
import { Dashboard } from './Dashboard';
import { Decisions } from './Decisions';
import { News } from './News';
import { Products } from './Products';
import { Customers } from './Customers';
import { Growth } from './Growth';
import { Operations } from './Operations';
import { People } from './People';
import { Finance } from './Finance';
import { Capital } from './Capital';
import { Markets } from './Markets';
import { Competitors } from './Competitors';
import { Research } from './Research';
import { Strategy } from './Strategy';
import { Analytics } from './Analytics';
import { Settings } from './Settings';
import { Learn } from './Learn';

export const PAGES: Record<PageId, ComponentType> = {
  dashboard: Dashboard, decisions: Decisions, news: News, products: Products, customers: Customers, growth: Growth,
  operations: Operations, people: People, finance: Finance, capital: Capital, markets: Markets, competitors: Competitors,
  research: Research, strategy: Strategy, analytics: Analytics, settings: Settings, learn: Learn,
};

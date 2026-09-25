import { createContext, useContext } from 'react';
import type { ExplainMetric } from '../../engine/explain';

export type PageId =
  | 'dashboard' | 'decisions' | 'products' | 'customers' | 'growth' | 'operations' | 'people' | 'finance' | 'capital'
  | 'markets' | 'competitors' | 'research' | 'strategy' | 'news' | 'analytics' | 'settings' | 'learn';

export interface NavItem { id: PageId; label: string; glyph: string; key?: string }

export const NAV: { group: string; items: NavItem[] }[] = [
  { group: 'Overview', items: [
    { id: 'dashboard', label: 'Dashboard', glyph: '◧', key: '1' },
    { id: 'decisions', label: 'Decisions', glyph: '✦', key: '2' },
    { id: 'news', label: 'News & events', glyph: '☰', key: '3' },
  ] },
  { group: 'Business', items: [
    { id: 'products', label: 'Products', glyph: '◆', key: '4' },
    { id: 'customers', label: 'Customers', glyph: '◉', key: '5' },
    { id: 'growth', label: 'Marketing & sales', glyph: '➚', key: '6' },
    { id: 'operations', label: 'Operations', glyph: '⚙', key: '7' },
    { id: 'people', label: 'People', glyph: '☺', key: '8' },
  ] },
  { group: 'Money', items: [
    { id: 'finance', label: 'Finance', glyph: '₹', key: '9' },
    { id: 'capital', label: 'Capital & funding', glyph: '◈' },
  ] },
  { group: 'World', items: [
    { id: 'markets', label: 'Markets & economy', glyph: '◍' },
    { id: 'competitors', label: 'Competitors', glyph: '⚔' },
  ] },
  { group: 'Growth', items: [
    { id: 'research', label: 'R&D, tech & risk', glyph: '⚗' },
    { id: 'strategy', label: 'Strategy & what-if', glyph: '♞' },
  ] },
  { group: 'Insight', items: [
    { id: 'analytics', label: 'Analytics & reports', glyph: '▦' },
  ] },
  { group: 'System', items: [
    { id: 'learn', label: 'Learn', glyph: '?' },
    { id: 'settings', label: 'Save & settings', glyph: '⚑' },
  ] },
];

export interface UiApi {
  page: PageId;
  go: (p: PageId) => void;
  explain: (m: ExplainMetric) => void;
  openPalette: () => void;
}

export const UiContext = createContext<UiApi>({ page: 'dashboard', go: () => {}, explain: () => {}, openPalette: () => {} });
export const useUi = () => useContext(UiContext);

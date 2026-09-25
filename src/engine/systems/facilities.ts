// Offices, warehouses, stores and labs — leased or owned.
import { MARKET_BY_ID } from '../data/markets';
import type { Facility, FacilityKind, SimState } from '../types';
import { industryOf } from '../context';
import { clamp, uid } from '../util';
import { moveCash, payExpense } from './ledger';
import { addAsset, assetMarketValue, sellAsset } from './assets';
import { addNews } from './news';

export interface FacilitySpec {
  kind: FacilityKind;
  tier: 'basic' | 'standard' | 'premium';
  size: number; // desks / 1000s of units / stores
}

const TIER = { basic: { quality: 42, cost: 0.75 }, standard: { quality: 60, cost: 1 }, premium: { quality: 82, cost: 1.6 } };

/** Capacity delivered per unit of `size`. */
export function capacityPerSize(s: SimState, kind: FacilityKind): number {
  const ind = industryOf(s);
  switch (kind) {
    case 'office': return 1; // desks
    case 'warehouse': return 1000; // units stored
    case 'lab': return 1; // researcher seats
    case 'store': {
      // Units served per month by one store/outlet/clinic.
      if (ind.id === 'restaurants') return 3500;
      if (ind.id === 'healthcare') return 1800;
      return Math.max(500, Math.round(6000000 / Math.max(50, ind.basePrice)));
    }
  }
}

/** Monthly rent for a facility spec in a market (INR). */
export function facilityRent(s: SimState, marketId: string, spec: FacilitySpec): number {
  const m = MARKET_BY_ID[marketId];
  const perSize = { office: 9000, warehouse: 35000, store: 180000, lab: 25000 }[spec.kind];
  return Math.round(perSize * spec.size * TIER[spec.tier].cost * m.rentIndex * s.macro.priceLevel);
}

/** Purchase price ≈ 12.5 years of rent (8% gross yield). */
export function facilityPrice(s: SimState, marketId: string, spec: FacilitySpec): number {
  return facilityRent(s, marketId, spec) * 150;
}

export function openFacility(s: SimState, marketId: string, spec: FacilitySpec, buy: boolean): { ok: boolean; message: string } {
  const m = MARKET_BY_ID[marketId];
  const ms = s.markets.find((x) => x.id === marketId);
  if (spec.kind === 'store' && !ms?.entered && !ms?.entering) return { ok: false, message: `Enter ${m.name} before opening stores there.` };
  const size = clamp(Math.round(spec.size), 1, spec.kind === 'office' ? 2000 : 500);
  const rent = facilityRent(s, marketId, { ...spec, size });
  const price = facilityPrice(s, marketId, { ...spec, size });
  const fitOut = rent * (spec.kind === 'store' ? 4 : 2);
  const upfront = buy ? price + fitOut : fitOut + rent * 2; // deposit
  if (s.finance.cash < upfront) return { ok: false, message: `Not enough cash: need ₹${Math.round(upfront).toLocaleString('en-IN')}.` };
  const f: Facility = {
    id: uid(s, 'fa'),
    kind: spec.kind,
    name: `${m.name} ${spec.kind === 'store' ? (industryOf(s).id === 'restaurants' ? 'outlet' : industryOf(s).id === 'healthcare' ? 'clinic' : 'store') : spec.kind} ${s.facilities.filter((x) => x.kind === spec.kind).length + 1}`,
    marketId,
    capacity: size * capacityPerSize(s, spec.kind),
    quality: TIER[spec.tier].quality,
    owned: buy,
    rent: buy ? 0 : rent,
    purchasePrice: buy ? price : 0,
    assetId: null,
    openedDay: s.day,
  };
  if (buy) {
    const a = addAsset(s, f.name, 'building', price, 360);
    f.assetId = a.id;
    moveCash(s, -price, 'investing', 'Property purchases');
  } else {
    // Deposits are refundable in reality; modelled as a prepaid fit-out expense for simplicity.
    payExpense(s, 'rent', rent * 2, 'Lease deposits');
  }
  addAsset(s, `${f.name} fit-out`, 'equipment', fitOut, 60);
  moveCash(s, -fitOut, 'investing', 'Fit-out & equipment');
  s.facilities.push(f);
  if (spec.kind === 'store') addNews(s, `${s.company.name} opens ${f.name}`, `New ${spec.tier} location in ${m.name}.`, 'company', 'positive');
  return { ok: true, message: `${f.name} opened (${buy ? 'purchased' : `leased at ₹${rent.toLocaleString('en-IN')}/month`}).` };
}

export function closeFacility(s: SimState, id: string): { ok: boolean; message: string } {
  const f = s.facilities.find((x) => x.id === id);
  if (!f) return { ok: false, message: 'Facility not found.' };
  let msg = `${f.name} closed.`;
  if (f.owned && f.assetId) {
    const a = s.finance.assets.find((x) => x.id === f.assetId);
    const value = a ? assetMarketValue(a) : 0;
    const proceeds = sellAsset(s, f.assetId);
    msg = `${f.name} sold for ₹${Math.round(proceeds || value).toLocaleString('en-IN')}.`;
  } else {
    payExpense(s, 'rent', f.rent * 2, 'Lease break fees');
    msg += ` Lease break fee ₹${Math.round(f.rent * 2).toLocaleString('en-IN')}.`;
  }
  s.facilities = s.facilities.filter((x) => x.id !== id);
  return { ok: true, message: msg };
}

/** Convert a leased facility into an owned one. */
export function buyFacility(s: SimState, id: string): { ok: boolean; message: string } {
  const f = s.facilities.find((x) => x.id === id);
  if (!f || f.owned) return { ok: false, message: 'Facility cannot be purchased.' };
  const price = f.rent * 150;
  if (s.finance.cash < price) return { ok: false, message: `Not enough cash: need ₹${Math.round(price).toLocaleString('en-IN')}.` };
  const a = addAsset(s, f.name, 'building', price, 360);
  moveCash(s, -price, 'investing', 'Property purchases');
  f.owned = true;
  f.assetId = a.id;
  f.purchasePrice = price;
  f.rent = 0;
  return { ok: true, message: `Bought ${f.name} for ₹${Math.round(price).toLocaleString('en-IN')}. No more rent.` };
}

export function monthlyFacilities(s: SimState): void {
  for (const f of s.facilities) if (!f.owned && f.rent > 0) payExpense(s, 'rent', f.rent, 'Rent');
  // Utilities scale with footprint.
  const footprint = s.facilities.reduce((a, f) => a + (f.rent || f.purchasePrice / 150), 0);
  if (footprint > 0) payExpense(s, 'utilities', footprint * 0.08, 'Utilities');
  const desks = s.facilities.filter((f) => f.kind === 'office').reduce((a, f) => a + f.capacity, 0);
  const onsite = s.company.remotePolicy === 'remote' ? 0.1 : s.company.remotePolicy === 'hybrid' ? 0.6 : 1;
  const officeStaff = s.employees.filter((e) => e.role !== 'production_worker' && !(e.role === 'specialist' && industryOf(s).requiresStores)).length;
  const need = officeStaff * onsite;
  s.metrics.officeUtilization = desks > 0 ? need / desks : need > 3 ? 2 : 0.5;
}

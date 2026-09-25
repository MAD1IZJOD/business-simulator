// Fixed assets: capitalised on purchase, depreciated straight-line, and sold at
// market value with a gain or loss booked to other income.
import type { FixedAsset, SimState } from '../types';
import { uid } from '../util';
import { moveCash, recordDepreciation, recordOtherIncome } from './ledger';

/** Capitalise an asset. The caller is responsible for the matching cash movement. */
export function addAsset(s: SimState, label: string, category: FixedAsset['category'], cost: number, lifeMonths: number): FixedAsset {
  const a: FixedAsset = { id: uid(s, 'a'), label, category, cost, bookValue: cost, lifeMonths, acquiredDay: s.day, marketValueMult: 1 };
  s.finance.assets.push(a);
  return a;
}

export function monthlyDepreciation(s: SimState): void {
  for (const a of s.finance.assets) {
    if (a.bookValue <= 0) continue;
    const d = Math.min(a.bookValue, a.cost / a.lifeMonths);
    a.bookValue -= d;
    recordDepreciation(s, d);
    // Buildings track the property market: appreciate with inflation, dip when rates are high.
    if (a.category === 'building' || a.category === 'factory') {
      a.marketValueMult *= 1 + (s.macro.inflation / 100) / 12 - Math.max(0, s.macro.interestRate - 6) / 1200;
    }
  }
}

/** Current market value of an asset (buildings keep value; equipment tracks book value). */
export function assetMarketValue(a: FixedAsset): number {
  if (a.category === 'building' || a.category === 'factory') return a.cost * a.marketValueMult * 0.97;
  return a.bookValue * 0.85;
}

export function sellAsset(s: SimState, assetId: string): number {
  const a = s.finance.assets.find((x) => x.id === assetId);
  if (!a) return 0;
  const proceeds = assetMarketValue(a);
  recordOtherIncome(s, proceeds - a.bookValue);
  // Remove book value from PP&E: the gain/loss already moved retained earnings.
  s.finance.assets = s.finance.assets.filter((x) => x.id !== assetId);
  moveCash(s, proceeds, 'investing', 'Asset sales');
  return proceeds;
}

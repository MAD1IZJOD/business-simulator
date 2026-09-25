// Inventory valued at weighted-average cost. Units can never go negative:
// takes are clamped to what is on hand and the shortfall is reported back.
import type { InventoryState, SimState } from '../types';
import { industryOf } from '../context';
import { recordCogs, recordOpex, payExpense } from './ledger';

export function emptyInventory(productId: string): InventoryState {
  return {
    productId,
    finished: 0,
    finishedValue: 0,
    raw: 0,
    rawValue: 0,
    wip: 0,
    wipValue: 0,
    damaged: 0,
    reorderPoint: 0,
    reorderQty: 0,
    autoReorder: true,
    productionTarget: 0,
    supplierSplit: {},
    stockoutDays: 0,
    lostUnits: 0,
  };
}

export function avgFinishedCost(inv: InventoryState): number {
  return inv.finished > 1e-9 ? inv.finishedValue / inv.finished : 0;
}

export function avgRawCost(inv: InventoryState): number {
  return inv.raw > 1e-9 ? inv.rawValue / inv.raw : 0;
}

export function addFinished(inv: InventoryState, units: number, totalCost: number): void {
  if (units <= 0) return;
  inv.finished += units;
  inv.finishedValue += totalCost;
}

export function addRaw(inv: InventoryState, units: number, totalCost: number): void {
  if (units <= 0) return;
  inv.raw += units;
  inv.rawValue += totalCost;
}

/** Remove finished units at average cost. Returns [unitsTaken, costRemoved]. */
export function takeFinished(inv: InventoryState, units: number): [number, number] {
  const n = Math.max(0, Math.min(units, inv.finished));
  if (n <= 0) return [0, 0];
  const cost = n >= inv.finished ? inv.finishedValue : avgFinishedCost(inv) * n;
  inv.finished -= n;
  inv.finishedValue -= cost;
  if (inv.finished < 1e-9) {
    inv.finished = 0;
    inv.finishedValue = 0;
  }
  return [n, cost];
}

export function takeRaw(inv: InventoryState, units: number): [number, number] {
  const n = Math.max(0, Math.min(units, inv.raw));
  if (n <= 0) return [0, 0];
  const cost = n >= inv.raw ? inv.rawValue : avgRawCost(inv) * n;
  inv.raw -= n;
  inv.rawValue -= cost;
  if (inv.raw < 1e-9) {
    inv.raw = 0;
    inv.rawValue = 0;
  }
  return [n, cost];
}

/** Sell finished goods: removes units and books their cost as COGS. */
export function consumeForSale(s: SimState, productId: string, units: number): number {
  const inv = s.inventory[productId];
  if (!inv) return 0;
  const [n, cost] = takeFinished(inv, units);
  if (cost > 0) recordCogs(s, 'materials', cost);
  return n;
}

export function totalUnits(s: SimState): number {
  let t = 0;
  for (const id in s.inventory) t += s.inventory[id].finished + s.inventory[id].raw;
  return t;
}

export function warehouseCapacity(s: SimState): number {
  let cap = 0;
  for (const f of s.facilities) if (f.kind === 'warehouse') cap += f.capacity;
  for (const f of s.factories) if (f.status === 'operational') cap += f.lines * f.capacityPerLine * 20;
  return cap;
}

/**
 * Monthly: carrying cost on inventory value, spoilage of perishable goods,
 * overflow storage fees when above warehouse capacity, damaged-goods disposal.
 */
export function monthlyInventory(s: SimState): void {
  const ind = industryOf(s);
  let value = 0;
  let units = 0;
  for (const id in s.inventory) {
    const inv = s.inventory[id];
    // Spoilage / obsolescence write-down.
    if (ind.perishability > 0 && inv.finished > 0) {
      const lostUnits = inv.finished * ind.perishability;
      const [, cost] = takeFinished(inv, lostUnits);
      if (cost > 0) recordOpex(s, 'writeoffs', cost);
      inv.damaged += lostUnits;
    }
    // Damaged goods are disposed of each month.
    inv.damaged = 0;
    value += inv.finishedValue + inv.rawValue + inv.wipValue;
    units += inv.finished + inv.raw;
  }
  // Carrying cost: storage, insurance and handling ≈ 1.5% of value per month.
  if (value > 0) payExpense(s, 'carrying', value * 0.015, 'Inventory carrying cost');
  const cap = warehouseCapacity(s);
  s.metrics.warehouseUtilization = cap > 0 ? units / cap : units > 0 ? 9.99 : 0;
  if (units > cap) {
    const overflow = units - cap;
    payExpense(s, 'carrying', overflow * Math.max(2, ind.basePrice * 0.004), 'Overflow storage');
  }
}

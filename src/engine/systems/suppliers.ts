// Suppliers and purchase orders. Orders arrive after a lead time, possibly late
// (reliability) or not at all (disruption). Deliveries create inventory and a
// payable on the supplier's payment terms — so buying stock costs cash later.
import { MARKET_BY_ID } from '../data/markets';
import { SUPPLIER_PREFIX, SUPPLIER_SUFFIX } from '../data/names';
import type { PurchaseOrder, SimState, Supplier } from '../types';
import { fxRatio, industryOf, modifier } from '../context';
import { chance, pick, randInt, randRange } from '../rng';
import { clamp, uid } from '../util';
import { addPayable } from './ledger';
import { addFinished, addRaw } from './inventory';
import { materialCost, unitCost } from './products';
import { addNews } from './news';

const PROFILES = [
  { label: 'Low-cost overseas', market: 'id', costMult: 0.78, reliability: 0.78, lead: 35, quality: 52, capacityMult: 3, terms: 30, minOrderMult: 2, risk: 0.35 },
  { label: 'Balanced domestic', market: 'in_rest', costMult: 0.95, reliability: 0.9, lead: 14, quality: 65, capacityMult: 1.5, terms: 45, minOrderMult: 1, risk: 0.15 },
  { label: 'Premium local', market: 'pun', costMult: 1.15, reliability: 0.97, lead: 7, quality: 80, capacityMult: 0.8, terms: 30, minOrderMult: 0.5, risk: 0.07 },
  { label: 'Global scale', market: 'us', costMult: 1.02, reliability: 0.93, lead: 25, quality: 72, capacityMult: 6, terms: 60, minOrderMult: 5, risk: 0.1 },
];

export function generateSuppliers(s: SimState): Supplier[] {
  const ind = industryOf(s);
  const baseVolume = Math.max(200, 3000000 / Math.max(50, ind.basePrice));
  return PROFILES.map((pr) => ({
    id: uid(s, 'sup'),
    name: `${pick(s, SUPPLIER_PREFIX)} ${pick(s, SUPPLIER_SUFFIX)}`,
    marketId: pr.market,
    costMult: pr.costMult * randRange(s, 0.96, 1.04),
    reliability: clamp(pr.reliability + randRange(s, -0.03, 0.03), 0.5, 0.99),
    leadTimeDays: Math.round(pr.lead * randRange(s, 0.85, 1.15)),
    quality: clamp(pr.quality + randRange(s, -5, 5), 20, 95),
    capacity: Math.round(baseVolume * pr.capacityMult),
    paymentTermsDays: pr.terms,
    minOrder: Math.round(baseVolume * 0.05 * pr.minOrderMult),
    exclusive: false,
    risk: pr.risk,
    relationship: 50,
    status: 'active' as const,
    disruptedUntil: 0,
    contracted: false,
    volumeThisMonth: 0,
    lateDeliveries: 0,
  }));
}

/** Contract manufacturing markup when a manufacturer has no factory of its own. */
export const CONTRACT_MFG_MARKUP = 1.3;

/** What we buy for a product: raw kits (to manufacture) or finished goods. */
export function orderKind(s: SimState): 'raw' | 'finished' {
  const ind = industryOf(s);
  if (ind.fulfillment === 'manufactured' && s.factories.some((f) => f.status === 'operational' || f.status === 'building')) return 'raw';
  return 'finished';
}

export function supplierUnitCost(s: SimState, productId: string, sup: Supplier, kind: 'raw' | 'finished'): number {
  const p = s.products.find((x) => x.id === productId);
  if (!p) return 0;
  const fx = fxRatio(s, sup.marketId);
  if (kind === 'raw') return materialCost(s, p, sup.costMult, fx);
  const ind = industryOf(s);
  const markup = ind.fulfillment === 'manufactured' ? CONTRACT_MFG_MARKUP : 1;
  let mat = 1;
  for (const m of s.modifiers) if (m.target === 'material_cost' && m.startDay <= s.day && m.endDay >= s.day) mat *= m.value;
  return unitCost(s, p) * sup.costMult * fx * markup * mat;
}

export function onOrder(s: SimState, productId: string, kind: 'raw' | 'finished'): number {
  let t = 0;
  for (const o of s.orders) if (o.status === 'open' && o.productId === productId && o.kind === kind) t += o.qty;
  return t;
}

export function placeOrder(s: SimState, productId: string, supplierId: string, qty: number): { ok: boolean; message: string; order?: PurchaseOrder } {
  const sup = s.suppliers.find((x) => x.id === supplierId);
  if (!sup) return { ok: false, message: 'Supplier not found.' };
  if (sup.status !== 'active') return { ok: false, message: `${sup.name} is ${sup.status} and cannot take orders.` };
  const exclusive = s.suppliers.find((x) => x.exclusive && x.status === 'active');
  if (exclusive && exclusive.id !== sup.id) return { ok: false, message: `You have an exclusive contract with ${exclusive.name}.` };
  qty = Math.floor(qty);
  if (qty < sup.minOrder) return { ok: false, message: `Minimum order with ${sup.name} is ${sup.minOrder.toLocaleString('en-IN')} units.` };
  const capLeft = sup.capacity * modifier(s, 'supplier_capacity', sup.id) - sup.volumeThisMonth;
  if (capLeft <= 0) return { ok: false, message: `${sup.name} is at capacity this month.` };
  const q = Math.min(qty, Math.floor(capLeft));
  const kind = orderKind(s);
  const lead = Math.round(sup.leadTimeDays * modifier(s, 'lead_time') * modifier(s, 'lead_time', sup.id));
  const order: PurchaseOrder = {
    id: uid(s, 'po'),
    productId,
    supplierId,
    qty: q,
    unitCost: supplierUnitCost(s, productId, sup, kind),
    orderDay: s.day,
    dueDay: s.day + Math.max(1, lead),
    kind,
    status: 'open',
    late: false,
  };
  sup.volumeThisMonth += q;
  s.orders.push(order);
  return { ok: true, message: `Ordered ${q.toLocaleString('en-IN')} ${kind === 'raw' ? 'material kits' : 'units'} from ${sup.name}, due in ${lead} days.`, order };
}

export function cancelOrder(s: SimState, orderId: string): string {
  const o = s.orders.find((x) => x.id === orderId);
  if (!o || o.status !== 'open') return 'Order cannot be cancelled.';
  const sup = s.suppliers.find((x) => x.id === o.supplierId);
  o.status = 'cancelled';
  if (sup) sup.relationship = clamp(sup.relationship - 8, 0, 100);
  return 'Order cancelled. The supplier relationship suffered.';
}

/** Daily: deliveries, delays and automatic reordering. */
export function dailySuppliers(s: SimState): void {
  for (const o of s.orders) {
    if (o.status !== 'open' || o.dueDay > s.day) continue;
    const sup = s.suppliers.find((x) => x.id === o.supplierId);
    if (!sup || sup.status === 'bankrupt') {
      o.status = 'cancelled';
      continue;
    }
    if (sup.status === 'disrupted' || !chance(s, sup.reliability)) {
      o.dueDay = s.day + (sup.status === 'disrupted' ? Math.max(3, sup.disruptedUntil - s.day) : randInt(s, 3, 15));
      if (!o.late) {
        o.late = true;
        sup.lateDeliveries += 1;
        sup.relationship = clamp(sup.relationship - 1, 0, 100);
      }
      continue;
    }
    const inv = s.inventory[o.productId];
    if (!inv) {
      o.status = 'cancelled';
      continue;
    }
    const value = o.qty * o.unitCost;
    if (o.kind === 'raw') addRaw(inv, o.qty, value);
    else addFinished(inv, o.qty, value);
    addPayable(s, value, sup.paymentTermsDays, 'Supplier payments');
    o.status = 'delivered';
    sup.relationship = clamp(sup.relationship + 0.5, 0, 100);
  }
  if (s.orders.length > 200) s.orders = s.orders.filter((o) => o.status === 'open' || s.day - o.dueDay < 120);
  autoReorder(s);
}

function autoReorder(s: SimState): void {
  const kind = orderKind(s);
  for (const p of s.products) {
    if (p.stage !== 'launched' && !(p.stage === 'development' && p.dev.progress >= 1)) continue;
    const inv = s.inventory[p.id];
    if (!inv || !inv.autoReorder || inv.reorderQty <= 0) continue;
    const onHand = kind === 'raw' ? inv.raw : inv.finished;
    if (onHand + onOrder(s, p.id, kind) >= inv.reorderPoint) continue;
    const active = s.suppliers.filter((x) => x.status === 'active');
    if (!active.length) continue;
    let split = Object.entries(inv.supplierSplit).filter(([id, w]) => w > 0 && active.some((a) => a.id === id));
    if (!split.length) split = [[active.sort((a, b) => b.reliability - a.reliability)[0].id, 1]];
    const total = split.reduce((a, [, w]) => a + w, 0);
    for (const [sid, w] of split) {
      const sup = s.suppliers.find((x) => x.id === sid)!;
      const qty = Math.max(sup.minOrder, Math.round((inv.reorderQty * w) / total));
      placeOrder(s, p.id, sid, qty);
    }
  }
}

/** Monthly: tune auto-reorder policies to recent demand, reset volumes, recover disruptions. */
export function monthlySuppliers(s: SimState, unitsLastMonth: Record<string, number>): void {
  for (const sup of s.suppliers) {
    sup.volumeThisMonth = 0;
    if (sup.status === 'disrupted' && sup.disruptedUntil <= s.day) {
      sup.status = 'active';
      addNews(s, `${sup.name} resumes normal operations`, 'Supply lines are flowing again.', 'industry', 'positive');
    }
  }
  const kind = orderKind(s);
  for (const p of s.products) {
    const inv = s.inventory[p.id];
    if (!inv || !inv.autoReorder) continue;
    const primary = s.suppliers.find((x) => (inv.supplierSplit[x.id] ?? 0) > 0) ?? s.suppliers[0];
    const lead = primary ? primary.leadTimeDays : 14;
    const daily = (unitsLastMonth[p.id] ?? 0) / 30;
    if (daily <= 0) continue;
    const safety = kind === 'raw' ? 10 : 7;
    inv.reorderPoint = Math.round(daily * (lead + safety));
    inv.reorderQty = Math.round(Math.max(daily * 30, primary?.minOrder ?? 0));
  }
}

/** Negotiate with a supplier. Leverage comes from relationship, our volume and their spare capacity. */
export function negotiateSupplier(s: SimState, supplierId: string, term: 'price' | 'payment_terms' | 'lead_time' | 'exclusivity' | 'min_order'): { ok: boolean; message: string } {
  const sup = s.suppliers.find((x) => x.id === supplierId);
  if (!sup) return { ok: false, message: 'Supplier not found.' };
  const key = `neg|${sup.id}`;
  const last = Number(s.flags[key] ?? -999);
  if (s.day - last < 45) return { ok: false, message: `${sup.name} won't renegotiate again so soon (wait ${45 - (s.day - last)} days).` };
  s.flags[key] = s.day;
  const volumeShare = sup.capacity > 0 ? sup.volumeThisMonth / sup.capacity : 0;
  const legal = s.employees.some((e) => e.role === 'lawyer') ? 0.05 : 0;
  const pSuccess = clamp(0.25 + sup.relationship / 250 + volumeShare * 0.3 + legal + (term === 'exclusivity' ? 0.2 : 0), 0.05, 0.9);
  if (!chance(s, pSuccess)) {
    sup.relationship = clamp(sup.relationship - 8, 0, 100);
    return { ok: false, message: `${sup.name} refused. Relationship −8 (chance was ${(pSuccess * 100).toFixed(0)}%).` };
  }
  switch (term) {
    case 'price':
      sup.costMult *= 0.94;
      return { ok: true, message: `${sup.name} cut prices 6%.` };
    case 'payment_terms':
      sup.paymentTermsDays += 15;
      return { ok: true, message: `${sup.name} extended payment terms to ${sup.paymentTermsDays} days.` };
    case 'lead_time':
      sup.leadTimeDays = Math.max(3, Math.round(sup.leadTimeDays * 0.8));
      return { ok: true, message: `${sup.name} cut lead time to ${sup.leadTimeDays} days.` };
    case 'min_order':
      sup.minOrder = Math.max(1, Math.round(sup.minOrder * 0.6));
      return { ok: true, message: `${sup.name} lowered the minimum order to ${sup.minOrder}.` };
    case 'exclusivity':
      for (const o of s.suppliers) o.exclusive = false;
      sup.exclusive = true;
      sup.costMult *= 0.88;
      sup.contracted = true;
      return { ok: true, message: `Exclusive deal signed: ${sup.name} prices −12%, but you can only order from them.` };
  }
}

export function supplierLocation(sup: Supplier): string {
  return MARKET_BY_ID[sup.marketId]?.name ?? sup.marketId;
}

import { useState } from 'react';
import { useSim } from '../game/hooks';
import { game } from '../game/controller';
import * as cmd from '../../engine/commands';
import { Badge, Bar, Empty, Field, Kpi, Modal, NumberInput, Panel, Seg, Tabs } from '../components/ui';
import { money, num, pct } from '../format';
import { industryOf, physical } from '../../engine/context';
import { onOrder, orderKind, supplierLocation, supplierUnitCost, CONTRACT_MFG_MARKUP } from '../../engine/systems/suppliers';
import { factoryCapacityPerDay, factoryCost, lineCost, CREW_PER_LINE, expectedDailyDemand } from '../../engine/systems/manufacturing';
import { facilityPrice, facilityRent, capacityPerSize } from '../../engine/systems/facilities';
import type { FacilitySpec } from '../../engine/systems/facilities';
import { serviceCapacityPerDay } from '../../engine/systems/market';
import { warehouseCapacity } from '../../engine/systems/inventory';
import { formatDay } from '../../engine/calendar';
import { MARKETS, MARKET_BY_ID } from '../../engine/data/markets';
import type { FacilityKind } from '../../engine/types';

export function Operations() {
  const s = useSim();
  const ind = industryOf(s);
  const isPhysical = physical(s);
  const tabs = [
    ...(isPhysical ? [{ id: 'inventory' as const, label: 'Inventory' }, { id: 'suppliers' as const, label: 'Suppliers & orders' }] : []),
    ...(ind.fulfillment === 'manufactured' ? [{ id: 'factories' as const, label: 'Manufacturing' }] : []),
    { id: 'facilities' as const, label: 'Facilities & real estate' },
    { id: 'capacity' as const, label: 'Capacity & quality' },
  ];
  const [tab, setTab] = useState<typeof tabs[number]['id']>(tabs[0].id);
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Operations</h1><p>{ind.fulfillment === 'digital' ? 'Digital delivery: capacity comes from infrastructure and support.' : ind.fulfillment === 'service' ? 'Service delivery: capacity comes from specialists and locations.' : ind.fulfillment === 'manufactured' ? 'You make physical products. Without a factory you buy finished goods from contract manufacturers at a markup.' : 'You buy finished goods from suppliers and hold inventory.'}</p></div></div>
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      {tab === 'inventory' && <Inventory />}
      {tab === 'suppliers' && <Suppliers />}
      {tab === 'factories' && <Factories />}
      {tab === 'facilities' && <Facilities />}
      {tab === 'capacity' && <Capacity />}
    </div>
  );
}

function Inventory() {
  const s = useSim();
  const kind = orderKind(s);
  const products = s.products.filter((p) => p.stage === 'launched' || (p.stage === 'development' && p.dev.progress >= 1));
  const cap = warehouseCapacity(s);
  const [orderFor, setOrderFor] = useState<string | null>(null);
  return (
    <>
      <div className="grid g4">
        <Kpi label="Inventory value" value={money(Object.values(s.inventory).reduce((a, i) => a + i.finishedValue + i.rawValue + i.wipValue, 0))} hint="Valued at weighted-average cost. Ties up cash; carrying cost ≈1.5%/month." />
        <Kpi label="Warehouse utilization" value={pct(s.metrics.warehouseUtilization)} delta={`capacity ${num(cap)} units`} deltaClass={s.metrics.warehouseUtilization > 1 ? 'bad' : 'muted'} />
        <Kpi label="Stock-out days (last month)" value={num(s.reports[s.reports.length - 1]?.kpis.stockoutDays ?? 0, 1)} />
        <Kpi label="Buying" value={kind === 'raw' ? 'Material kits' : 'Finished goods'} delta={kind === 'finished' && industryOf(s).fulfillment === 'manufactured' ? `Contract manufacturing +${pct(CONTRACT_MFG_MARKUP - 1, 0)}` : ''} />
      </div>
      <Panel title="Stock by product" flush>
        {products.length === 0 ? <div style={{ padding: 16 }}><Empty>No products ready yet.</Empty></div> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Product</th><th className="num">On hand</th><th className="num">On order</th><th className="num">Demand/day</th><th className="num">Days of cover</th><th className="num">Fill rate</th><th>Auto-reorder: point / qty</th><th /></tr></thead>
              <tbody>
                {products.map((p) => {
                  const inv = s.inventory[p.id];
                  const onHand = kind === 'raw' ? inv.raw : inv.finished;
                  const daily = expectedDailyDemand(s, p.id);
                  const cover = daily > 0 ? (inv.finished + (kind === 'raw' ? inv.raw : 0)) / daily : Infinity;
                  return (
                    <tr key={p.id}>
                      <td><strong>{p.name}</strong>{kind === 'raw' && <div className="tiny faint">finished {num(inv.finished)} · kits {num(inv.raw)}</div>}</td>
                      <td className="num">{num(onHand)}</td>
                      <td className="num">{num(onOrder(s, p.id, kind))}</td>
                      <td className="num">{num(daily, 1)}</td>
                      <td className={`num ${cover < 14 ? 'bad' : ''}`}>{Number.isFinite(cover) ? cover.toFixed(0) : '∞'}</td>
                      <td className="num">{pct(s.metrics.fillRate[p.id] ?? 1, 0)}</td>
                      <td>
                        <div className="row" style={{ gap: 6 }}>
                          <input type="checkbox" aria-label="Auto-reorder" checked={inv.autoReorder} onChange={(e) => game.dispatch((st) => cmd.setReorderPolicy(st, p.id, inv.reorderPoint, inv.reorderQty, e.target.checked))} />
                          <NumberInput label="Reorder point" value={inv.reorderPoint} onCommit={(v) => game.dispatch((st) => cmd.setReorderPolicy(st, p.id, v, inv.reorderQty, inv.autoReorder))} width={80} />
                          <NumberInput label="Reorder quantity" value={inv.reorderQty} onCommit={(v) => game.dispatch((st) => cmd.setReorderPolicy(st, p.id, inv.reorderPoint, v, inv.autoReorder))} width={80} />
                        </div>
                      </td>
                      <td className="num"><button type="button" className="btn sm" onClick={() => setOrderFor(p.id)}>Order…</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="faint small" style={{ padding: '8px 16px 14px' }}>With auto-reorder on, the engine re-tunes the reorder point monthly to cover lead time plus a week of safety stock. Perishable stock spoils at {pct(industryOf(s).perishability, 0)} per month.</p>
      </Panel>
      <OrderModal productId={orderFor} onClose={() => setOrderFor(null)} />
    </>
  );
}

function OrderModal({ productId, onClose }: { productId: string | null; onClose: () => void }) {
  const s = useSim();
  const [qty, setQty] = useState(500);
  const [sup, setSup] = useState('');
  const active = s.suppliers.filter((x) => x.status === 'active');
  const chosen = active.find((x) => x.id === sup) ?? active[0];
  const kind = orderKind(s);
  const unit = productId && chosen ? supplierUnitCost(s, productId, chosen, kind) : 0;
  return (
    <Modal open={productId !== null} onClose={onClose} title="Place a purchase order" sub="Stock arrives after the supplier's lead time and is paid on their payment terms."
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={!chosen} onClick={() => { if (productId && chosen) { const r = game.dispatch((st) => cmd.placeOrder(st, productId, chosen.id, qty)); if (r && r.ok) onClose(); } }}>Order {num(qty)} units</button></>}>
      {!active.length ? <Empty>No active suppliers.</Empty> : (
        <div className="grid g2">
          <Field label="Supplier"><select className="input" value={chosen?.id} onChange={(e) => setSup(e.target.value)}>{active.map((x) => <option key={x.id} value={x.id}>{x.name} — {x.leadTimeDays}d, {pct(x.reliability, 0)} on time</option>)}</select></Field>
          <Field label="Quantity" hint={chosen ? `Minimum ${num(chosen.minOrder)} · capacity left ${num(Math.max(0, chosen.capacity - chosen.volumeThisMonth))}` : ''}><NumberInput label="Quantity" value={qty} min={1} onCommit={setQty} suffix="units" /></Field>
          <div className="span2 muted">Unit cost {money(unit)} · total {money(unit * qty)} · payable in {chosen?.paymentTermsDays} days</div>
        </div>
      )}
    </Modal>
  );
}

function Suppliers() {
  const s = useSim();
  const products = s.products.filter((p) => p.stage !== 'discontinued');
  const p0 = products[0];
  const open = s.orders.filter((o) => o.status === 'open').sort((a, b) => a.dueDay - b.dueDay);
  return (
    <>
      <Panel title="Suppliers" sub="Negotiate price, payment terms, lead time, minimum order or exclusivity. Each supplier renegotiates at most every 45 days." flush>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Supplier</th><th>Status</th><th className="num">Cost ×</th><th className="num">Lead time</th><th className="num">On time</th><th className="num">Quality</th><th className="num">Capacity/mo</th><th className="num">Terms</th><th className="num">Min order</th><th className="num">Relationship</th><th>Share of orders ({p0?.name})</th><th>Negotiate</th></tr></thead>
            <tbody>
              {s.suppliers.map((x) => (
                <tr key={x.id}>
                  <td><strong>{x.name}</strong><div className="tiny faint">{supplierLocation(x)}{x.exclusive ? ' · exclusive' : ''}</div></td>
                  <td><Badge tone={x.status === 'active' ? 'good' : x.status === 'disrupted' ? 'warn' : 'bad'}>{x.status}</Badge></td>
                  <td className="num">{x.costMult.toFixed(2)}</td>
                  <td className="num">{x.leadTimeDays}d</td>
                  <td className="num">{pct(x.reliability, 0)}</td>
                  <td className="num">{x.quality.toFixed(0)}</td>
                  <td className="num">{num(x.capacity)}</td>
                  <td className="num">{x.paymentTermsDays}d</td>
                  <td className="num">{num(x.minOrder)}</td>
                  <td className="num">{x.relationship.toFixed(0)}</td>
                  <td>{p0 && <NumberInput label={`${x.name} share`} value={s.inventory[p0.id]?.supplierSplit[x.id] ?? 0} max={100} onCommit={(v) => game.dispatch((st) => cmd.setSupplierSplit(st, p0.id, { ...st.inventory[p0.id].supplierSplit, [x.id]: v }))} width={60} />}</td>
                  <td>
                    <select className="input" aria-label={`Negotiate with ${x.name}`} value="" disabled={x.status !== 'active'} onChange={(e) => { const t = e.target.value as Parameters<typeof cmd.negotiateSupplier>[2]; if (t) game.dispatch((st) => cmd.negotiateSupplier(st, x.id, t)); }}>
                      <option value="">Choose…</option>
                      <option value="price">Lower price</option>
                      <option value="payment_terms">Longer payment terms</option>
                      <option value="lead_time">Faster delivery</option>
                      <option value="min_order">Smaller minimum order</option>
                      <option value="exclusivity">Exclusivity deal</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="faint small" style={{ padding: '8px 16px 14px' }}>Auto-reorders split across suppliers by the weights you set. Multiple suppliers reduce disruption risk; cheap overseas suppliers are slower and less reliable.</p>
      </Panel>
      <Panel title={`Open purchase orders (${open.length})`} flush>
        {open.length === 0 ? <div style={{ padding: 16 }}><Empty>No open orders.</Empty></div> : (
          <table className="data">
            <thead><tr><th>Product</th><th>Supplier</th><th className="num">Qty</th><th className="num">Value</th><th>Ordered</th><th>Due</th><th /></tr></thead>
            <tbody>{open.map((o) => <tr key={o.id}><td>{s.products.find((p) => p.id === o.productId)?.name}</td><td>{s.suppliers.find((x) => x.id === o.supplierId)?.name}</td><td className="num">{num(o.qty)}</td><td className="num">{money(o.qty * o.unitCost)}</td><td>{formatDay(s, o.orderDay)}</td><td className={o.late ? 'bad' : ''}>{formatDay(s, o.dueDay)}{o.late ? ' (late)' : ''}</td><td className="num"><button type="button" className="btn sm ghost" onClick={() => game.dispatch((st) => cmd.cancelOrder(st, o.id))}>Cancel</button></td></tr>)}</tbody>
          </table>
        )}
      </Panel>
    </>
  );
}

function Factories() {
  const s = useSim();
  const [market, setMarket] = useState(s.config.hqMarket);
  const [lines, setLines] = useState(2);
  const [owned, setOwned] = useState(false);
  const capDay = factoryCapacityPerDay(s);
  const cost = factoryCost(s, market, lines);
  const crew = s.employees.filter((e) => e.role === 'production_worker').length;
  const totalLines = s.factories.reduce((a, f) => a + f.lines, 0);
  return (
    <>
      <div className="grid g4">
        <Kpi label="Capacity" value={`${num(capDay)} units/day`} />
        <Kpi label="Production crew" value={`${crew} / ${totalLines * CREW_PER_LINE}`} delta={`${CREW_PER_LINE} workers per line`} deltaClass={crew < totalLines * CREW_PER_LINE ? 'warn' : 'muted'} />
        <Kpi label="Produced this month" value={num(s.month.produced)} />
        <Kpi label="Manufacturing tech" value={`Level ${s.tech.levels.manufacturing}`} delta="fewer defects, more throughput" />
      </div>
      {s.factories.map((f) => (
        <Panel key={f.id} title={f.name} sub={`${MARKET_BY_ID[f.marketId].name} · ${f.owned ? 'owned' : `leased ${money(f.rent)}/mo`}`} actions={<Badge tone={f.status === 'operational' ? 'good' : 'info'}>{f.status === 'building' ? `opens ${formatDay(s, f.readyDay)}` : 'operational'}</Badge>}>
          <div className="grid g4">
            <div className="stack-sm"><span className="faint small">Lines</span><strong>{f.lines}{f.linesUnderConstruction ? ` (+${f.linesUnderConstruction} building)` : ''}</strong><button type="button" className="btn sm" onClick={() => game.dispatch((st) => cmd.addLines(st, f.id, 1))}>Add a line ({money(lineCost(s, f.marketId))})</button></div>
            <div className="stack-sm"><span className="faint small">Utilization</span><strong>{pct(f.utilization, 0)}</strong><Bar value={f.utilization} label="Utilization" /></div>
            <div className="stack-sm"><span className="faint small">Machine condition</span><strong>{f.condition.toFixed(0)}</strong><Bar value={f.condition / 100} tone={f.condition < 60 ? 'bad' : 'good'} label="Condition" /></div>
            <Field label="Maintenance budget / month" hint="Keeps machines in condition; poor condition raises defects and cuts throughput"><NumberInput label="Maintenance" value={f.maintenanceBudget} onCommit={(v) => game.dispatch((st) => cmd.setMaintenance(st, f.id, v))} suffix="₹" /></Field>
          </div>
        </Panel>
      ))}
      <Panel title="Build a factory" sub="Takes ~5 months. Owning costs more upfront (capitalised and depreciated); leasing costs rent.">
        <div className="grid g4">
          <Field label="Location"><select className="input" value={market} onChange={(e) => setMarket(e.target.value)}>{MARKETS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
          <Field label={`Production lines: ${lines}`}><input type="range" min={1} max={10} value={lines} onChange={(e) => setLines(Number(e.target.value))} /></Field>
          <Field label="Ownership"><Seg label="Ownership" value={owned ? 'own' : 'lease'} onChange={(v) => setOwned(v === 'own')} options={[{ id: 'lease', label: 'Lease' }, { id: 'own', label: 'Buy' }]} /></Field>
          <div className="stack-sm"><span className="faint small">Upfront cost</span><strong>{money(owned ? cost : cost * 0.15)}</strong><button type="button" className="btn primary sm" onClick={() => game.dispatch((st) => cmd.buildFactory(st, market, lines, owned))}>Build</button></div>
        </div>
        <p className="faint small" style={{ marginTop: 8 }}>Each line makes about {num(lines ? s.factories[0]?.capacityPerLine ?? 0 : 0)} units/day when fully staffed. Hire production workers in People.</p>
      </Panel>
      <Panel title="Production plan" flush>
        <table className="data">
          <thead><tr><th>Product</th><th className="num">Kits on hand</th><th className="num">Finished</th><th>Target units/day (0 = automatic)</th></tr></thead>
          <tbody>{s.products.filter((p) => p.stage !== 'discontinued').map((p) => <tr key={p.id}><td>{p.name}</td><td className="num">{num(s.inventory[p.id]?.raw ?? 0)}</td><td className="num">{num(s.inventory[p.id]?.finished ?? 0)}</td><td><NumberInput label="Production target" value={s.inventory[p.id]?.productionTarget ?? 0} onCommit={(v) => game.dispatch((st) => cmd.setProductionTarget(st, p.id, v))} width={100} /></td></tr>)}</tbody>
        </table>
      </Panel>
    </>
  );
}

function Facilities() {
  const s = useSim();
  const [kind, setKind] = useState<FacilityKind>('office');
  const [market, setMarket] = useState(s.config.hqMarket);
  const [tier, setTier] = useState<FacilitySpec['tier']>('standard');
  const [size, setSize] = useState(10);
  const [buy, setBuy] = useState(false);
  const spec: FacilitySpec = { kind, tier, size };
  const rent = facilityRent(s, market, spec);
  const available = MARKETS.filter((m) => s.markets.find((x) => x.id === m.id)?.entered || s.markets.find((x) => x.id === m.id)?.entering);
  const sizeLabel = kind === 'office' ? 'desks' : kind === 'warehouse' ? '× 1,000 units' : kind === 'lab' ? 'researcher seats' : 'locations';
  return (
    <>
      <Panel title="Your facilities" flush>
        {s.facilities.length === 0 ? <div style={{ padding: 16 }}><Empty>No facilities.</Empty></div> : (
          <table className="data">
            <thead><tr><th>Facility</th><th>Type</th><th>Location</th><th className="num">Capacity</th><th className="num">Quality</th><th>Tenure</th><th className="num">Rent / mo</th><th /></tr></thead>
            <tbody>{s.facilities.map((f) => (
              <tr key={f.id}>
                <td>{f.name}</td><td>{f.kind}</td><td>{MARKET_BY_ID[f.marketId].name}</td><td className="num">{num(f.capacity)}</td><td className="num">{f.quality}</td><td>{f.owned ? 'Owned' : 'Leased'}</td><td className="num">{f.owned ? '—' : money(f.rent)}</td>
                <td className="num"><div className="row" style={{ justifyContent: 'flex-end' }}>{!f.owned && <button type="button" className="btn sm" onClick={() => game.dispatch((st) => cmd.buyFacility(st, f.id))}>Buy ({money(f.rent * 150)})</button>}<button type="button" className="btn sm danger" onClick={() => game.dispatch((st) => cmd.closeFacility(st, f.id))}>{f.owned ? 'Sell' : 'Close'}</button></div></td>
              </tr>
            ))}</tbody>
          </table>
        )}
        <p className="faint small" style={{ padding: '8px 16px 14px' }}>Office utilization {pct(s.metrics.officeUtilization, 0)} ({s.company.remotePolicy} work). Overcrowded offices hurt morale and productivity. Owned property is depreciated but can be sold at market value.</p>
      </Panel>
      <Panel title="Open or buy a facility">
        <div className="grid g3">
          <Field label="Type"><Seg label="Facility type" value={kind} onChange={setKind} options={[{ id: 'office', label: 'Office' }, { id: 'warehouse', label: 'Warehouse' }, { id: 'store', label: industryOf(s).id === 'restaurants' ? 'Outlet' : industryOf(s).id === 'healthcare' ? 'Clinic' : 'Store' }, { id: 'lab', label: 'Lab' }]} /></Field>
          <Field label="Location"><select className="input" value={market} onChange={(e) => setMarket(e.target.value)}>{available.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
          <Field label="Tier"><Seg label="Tier" value={tier} onChange={setTier} options={[{ id: 'basic', label: 'Basic' }, { id: 'standard', label: 'Standard' }, { id: 'premium', label: 'Premium' }]} /></Field>
          <Field label={`Size (${sizeLabel})`}><NumberInput label="Size" value={size} min={1} onCommit={setSize} /></Field>
          <Field label="Rent or buy"><Seg label="Tenure" value={buy ? 'buy' : 'rent'} onChange={(v) => setBuy(v === 'buy')} options={[{ id: 'rent', label: 'Rent' }, { id: 'buy', label: 'Buy' }]} /></Field>
          <div className="stack-sm">
            <span className="faint small">{buy ? `Price ${money(facilityPrice(s, market, spec))}` : `Rent ${money(rent)}/month`} · capacity {num(size * capacityPerSize(s, kind))}</span>
            <button type="button" className="btn primary sm" onClick={() => game.dispatch((st) => cmd.openFacility(st, market, spec, buy))}>{buy ? 'Buy' : 'Lease'}</button>
          </div>
        </div>
      </Panel>
    </>
  );
}

function Capacity() {
  const s = useSim();
  const ind = industryOf(s);
  const svc = serviceCapacityPerDay(s);
  return (
    <div className="grid g3">
      {ind.serviceCapacity > 0 && (
        <Panel title="Service capacity" sub={`${ind.specialistLabel}s deliver ~${ind.serviceCapacity} units/month each`}>
          <Kpi label="Capacity / month" value={Number.isFinite(svc) ? num(svc * 30) : '∞'} delta={`Utilization ${pct(s.metrics.serviceUtilization, 0)}`} deltaClass={s.metrics.serviceUtilization > 1 ? 'bad' : 'muted'} />
          <p className="small muted" style={{ marginTop: 8 }}>Demand above capacity is lost and hurts satisfaction. Hire {ind.specialistLabel.toLowerCase()}s in People.</p>
        </Panel>
      )}
      {ind.requiresStores && (
        <Panel title="Locations" sub="Each location caps how many customers you can serve in its market">
          {s.markets.filter((m) => m.entered).map((m) => {
            const cap = s.facilities.filter((f) => f.kind === 'store' && f.marketId === m.id).reduce((a, f) => a + f.capacity, 0);
            return <div key={m.id} className="row between small"><span>{MARKET_BY_ID[m.id].name}</span><span className={cap === 0 ? 'bad' : ''}>{cap === 0 ? 'No locations: no sales' : `${num(cap)} / month`}</span></div>;
          })}
        </Panel>
      )}
      <Panel title="Reliability & quality">
        <div className="grid g2">
          <Kpi label="Reliability" value={s.metrics.reliability.toFixed(1)} hint="Uptime/service reliability: affected by infrastructure tech and tech debt." />
          <Kpi label="Support response" value={`${s.metrics.responseHours.toFixed(0)}h`} />
        </div>
        <Field label="Warranty policy" hint="Longer warranties raise trust but cost more in claims">
          <Seg label="Warranty" value={s.company.warrantyPolicy} onChange={(v) => game.dispatch((st) => cmd.setWarranty(st, v))} options={[{ id: 'none', label: 'None' }, { id: 'standard', label: 'Standard' }, { id: 'extended', label: 'Extended' }]} />
        </Field>
        <p className="faint small" style={{ marginTop: 8 }}>Returns this month so far: {num(s.month.returns, 1)} units. 60% are restocked, 40% are damaged.</p>
      </Panel>
    </div>
  );
}

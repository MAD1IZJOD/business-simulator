import { useState } from 'react';
import { useSim } from '../game/hooks';
import { game } from '../game/controller';
import * as cmd from '../../engine/commands';
import { Badge, Bar, Empty, Field, Modal, NumberInput, Panel, Seg, Tip } from '../components/ui';
import { money, num, pct } from '../format';
import { industryOf, customersOfProduct } from '../../engine/context';
import { MONETIZATIONS } from '../../engine/data/businessModels';
import { effortFor, satisfactionDrivers, unitCost, SPEED_MULT } from '../../engine/systems/products';
import { referencePrice } from '../../engine/systems/pricing';
import { formatDay } from '../../engine/calendar';
import type { DevSpeed, Monetization, Positioning, Product } from '../../engine/types';
import { SEGMENTS } from '../../engine/data/segments';

const PHASE_TONE: Record<string, 'good' | 'warn' | 'bad' | 'info' | ''> = { development: 'info', launch: 'info', growth: 'good', maturity: '', decline: 'warn', discontinued: 'bad' };

export function Products() {
  const s = useSim();
  const [newOpen, setNewOpen] = useState(false);
  const [updateFor, setUpdateFor] = useState<Product | null>(null);
  const active = s.products.filter((p) => p.stage !== 'discontinued');
  const old = s.products.filter((p) => p.stage === 'discontinued');
  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Products</h1><p>Idea → development → launch → growth → maturity → decline. Engineering capacity: {s.metrics.engineeringCapacity.toFixed(1)} dev-points/month.</p></div>
        <button type="button" className="btn primary" onClick={() => setNewOpen(true)}>New product</button>
      </div>
      {active.map((p) => <ProductCard key={p.id} p={p} onUpdate={() => setUpdateFor(p)} />)}
      {old.length > 0 && (
        <Panel title="Discontinued">
          {old.map((p) => <div key={p.id} className="row between small"><span>{p.name}</span><span className="faint">since {formatDay(s, p.discontinuedDay ?? 0)} · {num(customersOfProduct(s, p.id))} customers remaining</span></div>)}
        </Panel>
      )}
      <NewProductModal open={newOpen} onClose={() => setNewOpen(false)} />
      <UpdateModal p={updateFor} onClose={() => setUpdateFor(null)} />
    </div>
  );
}

function ProductCard({ p, onUpdate }: { p: Product; onUpdate: () => void }) {
  const s = useSim();
  const ind = industryOf(s);
  const mon = MONETIZATIONS[p.monetization];
  const rt = mon.revenueType;
  const inDev = (p.stage === 'development' && p.dev.progress < 1) || p.updating;
  const ready = p.stage === 'development' && p.dev.progress >= 1;
  const customers = customersOfProduct(s, p.id);
  const ref = referencePrice(s, s.config.hqMarket, s.config.targetSegment, p) / s.macro.priceLevel;
  const cost = unitCost(s, p);
  const r = s.reports[s.reports.length - 1];
  const rev = r?.breakdown.revenueByProduct[p.id] ?? 0;
  const drivers = satisfactionDrivers(s, p);
  const reviews = s.company.reviews.filter((x) => x.productId === p.id).slice(0, 3);
  const monthsToGo = inDev ? ((1 - p.dev.progress) * p.dev.effortRequired) / Math.max(0.1, s.metrics.engineeringCapacity * p.dev.engineeringShare * SPEED_MULT[p.dev.speed] + p.dev.monthlyBudget / 150000) : 0;

  return (
    <Panel title={<span className="row">{p.name}<Badge tone={PHASE_TONE[p.phase]}>{p.updating ? 'updating' : p.phase}</Badge><Badge>{mon.name}</Badge><Badge>{p.positioning}</Badge>{p.acquired && <Badge tone="info">acquired</Badge>}{p.patent && <Badge tone={p.patent.status === 'granted' ? 'good' : p.patent.status === 'rejected' ? 'bad' : 'info'}>patent {p.patent.status}</Badge>}</span>} sub={p.category}
      actions={p.stage === 'launched' && (
        <>
          <button type="button" className="btn sm" onClick={onUpdate} disabled={p.updating}>Develop update</button>
          <button type="button" className="btn sm" onClick={() => game.dispatch((st) => cmd.filePatent(st, p.id))} disabled={p.patent?.status === 'pending' || p.patent?.status === 'granted'}>File patent (₹8L)</button>
          <button type="button" className="btn sm danger" onClick={() => game.dispatch((st) => cmd.discontinueProduct(st, p.id))}>Discontinue</button>
        </>
      )}>
      <div className="grid g4">
        <div className="stack-sm">
          <span className="faint small">Quality</span>
          <strong className="num">{p.stage === 'development' && !ready ? `target ${p.dev.qualityTarget.toFixed(0)}` : p.quality.toFixed(0)}</strong>
          <Bar value={(p.stage === 'development' && !ready ? p.dev.qualityTarget : p.quality) / 100} label="Quality" />
          <span className="faint tiny">Features {p.features.toFixed(0)} · defects {pct(p.defectRate)} · tech debt {p.techDebt.toFixed(0)}</span>
        </div>
        <div className="stack-sm">
          <span className="faint small">{mon.priceLabel}</span>
          {rt === 'advertising' ? (
            <NumberInput label="Ad load" value={p.adLoad} min={1} max={10} onCommit={(v) => game.dispatch((st) => cmd.setAdLoad(st, p.id, v))} suffix="/10" width={80} />
          ) : (
            <NumberInput label={`${p.name} price`} value={p.price} min={0.01} onCommit={(v) => game.dispatch((st) => cmd.setPrice(st, p.id, v))} suffix={rt === 'take_rate' ? '%' : '₹'} width={110} />
          )}
          <span className="faint tiny">{rt === 'take_rate' ? `Market reference ≈ ${ind.takeRate}%` : rt === 'advertising' ? 'More ads = more revenue per user, lower satisfaction' : `Reference for ${SEGMENTS[s.config.targetSegment].name.toLowerCase()} ≈ ${money(ref)} ${ind.priceUnit}`}</span>
        </div>
        <div className="stack-sm">
          <span className="faint small">Unit economics</span>
          <strong className="num">{rt === 'take_rate' || rt === 'advertising' ? '—' : `${money(cost)} cost`}</strong>
          <span className="faint tiny">{rt === 'take_rate' || rt === 'advertising' ? 'Costs scale with volume processed' : `Gross margin at list ≈ ${pct(1 - cost / Math.max(1e-9, p.price))}`}</span>
        </div>
        <div className="stack-sm">
          <span className="faint small">Customers · revenue last month</span>
          <strong className="num">{num(customers)} · {money(rev)}</strong>
          <span className="faint tiny">Satisfaction {p.satisfaction.toFixed(0)}/100 · appeal ×{p.novelty.toFixed(2)}</span>
        </div>
      </div>

      {(inDev || ready) && (
        <div className="panel" style={{ background: 'var(--panel-2)', marginTop: 12 }}>
          <div className="row between">
            <strong>{ready ? 'Ready to launch — see your decision inbox' : p.updating ? 'Update in development' : 'In development'}</strong>
            <span className="small muted">{pct(p.dev.progress, 0)} · {ready ? '' : `≈ ${monthsToGo.toFixed(1)} months left`}</span>
          </div>
          <Bar value={p.dev.progress} label="Development progress" />
          {!ready && (
            <div className="grid g4" style={{ marginTop: 10 }}>
              <Field label="Monthly budget (contractors, tools)"><NumberInput label="Dev budget" value={p.dev.monthlyBudget} onCommit={(v) => game.dispatch((st) => cmd.updateDevPlan(st, p.id, { monthlyBudget: v }))} suffix="₹/mo" /></Field>
              <Field label="Quality target" hint="Higher quality takes more effort"><NumberInput label="Quality target" value={p.dev.qualityTarget} min={10} max={100} onCommit={(v) => game.dispatch((st) => cmd.updateDevPlan(st, p.id, { qualityTarget: v }))} /></Field>
              <Field label="Feature scope" hint="More features, longer build"><NumberInput label="Feature scope" value={p.dev.featureScope} min={5} max={100} onCommit={(v) => game.dispatch((st) => cmd.updateDevPlan(st, p.id, { featureScope: v }))} /></Field>
              <Field label="Speed" hint="Crunch is faster but raises defects and burnout">
                <Seg label="Development speed" value={p.dev.speed} onChange={(v: DevSpeed) => game.dispatch((st) => cmd.updateDevPlan(st, p.id, { speed: v }), true)} options={[{ id: 'lean', label: 'Lean' }, { id: 'normal', label: 'Normal' }, { id: 'crunch', label: 'Crunch' }]} />
              </Field>
            </div>
          )}
          <p className="faint tiny" style={{ marginTop: 6 }}>Effort {p.dev.effortRequired.toFixed(1)} engineer-months · spent {money(p.dev.spent)} · defect risk {pct(p.dev.defectRisk)}</p>
        </div>
      )}

      {p.stage === 'launched' && (
        <div className="grid g2" style={{ marginTop: 12 }}>
          <div>
            <h4 style={{ marginBottom: 6 }}>What drives satisfaction</h4>
            {drivers.map((d) => (
              <div key={d.label} className="row between small" style={{ padding: '2px 0' }}><span>{d.label}</span><span className={`num ${d.value >= 0 ? 'good' : 'bad'}`}>{d.value >= 0 ? '+' : ''}{d.value.toFixed(1)}</span></div>
            ))}
          </div>
          <div>
            <h4 style={{ marginBottom: 6 }}>Recent reviews · {s.company.reviewRating.toFixed(1)}★ average</h4>
            {reviews.length === 0 ? <p className="faint small">No reviews yet.</p> : reviews.map((rv) => (
              <div key={rv.id} className="small" style={{ padding: '4px 0', borderBottom: '1px solid var(--line)' }}>
                <span className="warn" aria-label={`${rv.rating} out of 5 stars`}>{'★'.repeat(rv.rating)}{'☆'.repeat(5 - rv.rating)}</span> <span className="muted">“{rv.text}”</span> <span className="faint tiny">— {SEGMENTS[rv.segmentId]?.name}</span>
              </div>
            ))}
            {(p.monetization === 'marketplace' || industryOf(s).networkEffect > 0.2) && (
              <div className="row" style={{ marginTop: 10 }}>
                <Tip text="Invest in APIs, integrations and developer relations. Grows the ecosystem, which raises appeal and retention."><span className="small muted">Platform program</span></Tip>
                <NumberInput label="Platform investment" value={p.platformInvestment} onCommit={(v) => game.dispatch((st) => cmd.setPlatformInvestment(st, p.id, v))} suffix="₹/mo" />
                <span className="faint tiny">Ecosystem {num(p.ecosystem)}{p.monetization === 'marketplace' ? ` · sellers ${num(p.sellers)}` : ''}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

function NewProductModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useSim();
  const ind = industryOf(s);
  const [name, setName] = useState('');
  const [category, setCategory] = useState(ind.categories[1] ?? ind.categories[0]);
  const [positioning, setPositioning] = useState<Positioning>('mainstream');
  const [monetization, setMonetization] = useState<Monetization>(ind.defaultMonetization);
  const [quality, setQuality] = useState(65);
  const [scope, setScope] = useState(50);
  const [budget, setBudget] = useState(100000);
  const [speed, setSpeed] = useState<DevSpeed>('normal');
  const effort = effortFor(s, scope, quality);
  const cap = s.metrics.engineeringCapacity * SPEED_MULT[speed] + (budget / 150000) * SPEED_MULT[speed];
  const create = () => {
    const r = game.dispatch((st) => cmd.startProduct(st, { name, category, positioning, monetization, qualityTarget: quality, featureScope: scope, monthlyBudget: budget, speed }));
    if (r && r.ok) { setName(''); onClose(); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Develop a new product" sub="Trade-offs: quality and scope cost time; budget and crunch buy speed; crunch and underfunding raise defect risk." wide
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn primary" onClick={create} disabled={!name.trim()}>Start development</button></>}>
      <div className="grid g2">
        <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} /></Field>
        <Field label="Category"><select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>{ind.categories.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Positioning"><Seg label="Positioning" value={positioning} onChange={setPositioning} options={[{ id: 'budget', label: 'Budget' }, { id: 'mainstream', label: 'Mainstream' }, { id: 'premium', label: 'Premium' }, { id: 'luxury', label: 'Luxury' }]} /></Field>
        <Field label="Business model" hint={MONETIZATIONS[monetization].description}><select className="input" value={monetization} onChange={(e) => setMonetization(e.target.value as Monetization)}>{ind.monetizations.map((m) => <option key={m} value={m}>{MONETIZATIONS[m].name}</option>)}</select></Field>
        <Field label={`Quality target: ${quality}`}><input type="range" min={20} max={100} value={quality} onChange={(e) => setQuality(Number(e.target.value))} /></Field>
        <Field label={`Feature scope: ${scope}`}><input type="range" min={10} max={100} value={scope} onChange={(e) => setScope(Number(e.target.value))} /></Field>
        <Field label="Monthly development budget"><NumberInput label="Budget" value={budget} onCommit={setBudget} suffix="₹/mo" /></Field>
        <Field label="Speed"><Seg label="Speed" value={speed} onChange={setSpeed} options={[{ id: 'lean', label: 'Lean' }, { id: 'normal', label: 'Normal' }, { id: 'crunch', label: 'Crunch' }]} /></Field>
      </div>
      <div className="panel" style={{ marginTop: 12, background: 'var(--panel-2)' }}>
        <div className="grid g3">
          <div><div className="faint small">Effort required</div><strong>{effort.toFixed(1)} engineer-months</strong></div>
          <div><div className="faint small">Estimated time (all engineering on it)</div><strong>{cap > 0 ? `${(effort / cap).toFixed(1)} months` : 'Never — hire engineers or add budget'}</strong></div>
          <div><div className="faint small">Estimated cost</div><strong>{cap > 0 ? money((effort / cap) * budget) : '–'}</strong> <span className="faint tiny">+ salaries</span></div>
        </div>
      </div>
    </Modal>
  );
}

function UpdateModal({ p, onClose }: { p: Product | null; onClose: () => void }) {
  const [quality, setQuality] = useState(75);
  const [scope, setScope] = useState(60);
  const [budget, setBudget] = useState(100000);
  return (
    <Modal open={p !== null} onClose={onClose} title={`Develop an update to ${p?.name ?? ''}`} sub="Updates restore appeal, cut tech debt and can raise quality and features."
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn primary" onClick={() => { if (p) { const r = game.dispatch((st) => cmd.startProductUpdate(st, p.id, { qualityTarget: quality, featureScope: scope, monthlyBudget: budget, speed: 'normal' })); if (r && r.ok) onClose(); } }}>Start update</button></>}>
      <div className="grid g3">
        <Field label={`Quality target: ${quality}`}><input type="range" min={20} max={100} value={quality} onChange={(e) => setQuality(Number(e.target.value))} /></Field>
        <Field label={`Feature scope: ${scope}`}><input type="range" min={10} max={100} value={scope} onChange={(e) => setScope(Number(e.target.value))} /></Field>
        <Field label="Monthly budget"><NumberInput label="Budget" value={budget} onCommit={setBudget} suffix="₹/mo" /></Field>
      </div>
      {p && <p className="faint small" style={{ marginTop: 10 }}>Current quality {p.quality.toFixed(0)}, features {p.features.toFixed(0)}, appeal ×{p.novelty.toFixed(2)}.</p>}
      {!p && <Empty>No product selected.</Empty>}
    </Modal>
  );
}

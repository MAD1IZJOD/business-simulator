import { useState } from 'react';
import { useSim } from '../game/hooks';
import { game } from '../game/controller';
import { useUi } from '../shell/nav';
import * as cmd from '../../engine/commands';
import { Badge, Empty, Field, Kpi, Modal, NumberInput, Panel, Seg } from '../components/ui';
import { RangePicker, TimeChart, sliceRange, useRange } from '../components/charts';
import { money, num, pct } from '../format';
import { competitorCustomers, competitorRevenue, intelEstimate } from '../../engine/systems/competitors';
import { acquisitionQuote } from '../../engine/systems/ma';
import { MARKET_BY_ID } from '../../engine/data/markets';
import { computeValuation } from '../../engine/systems/valuation';
import type { Competitor } from '../../engine/types';

export function Competitors() {
  const s = useSim();
  const ui = useUi();
  const [range, setRange] = useRange(24);
  const [target, setTarget] = useState<Competitor | null>(null);
  const r = s.reports[s.reports.length - 1];
  const active = s.competitors.filter((c) => c.status === 'active');
  const gone = s.competitors.filter((c) => c.status !== 'active');
  const acc = 1 - 0.13 * s.tech.levels.analytics;
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Competitors</h1><p>Rivals decide independently each month: pricing, launches, hiring, fundraising and expansion. Intelligence is estimated — accuracy ±{pct(0.35 * acc, 0)} (improve with Analytics tech).</p></div></div>
      <div className="grid g3">
        <Kpi label="Our market share" value={r ? pct(r.kpis.marketShare, 2) : '–'} onWhy={() => ui.explain('marketShare')} />
        <Kpi label="Active competitors" value={String(active.length)} delta={`${gone.length} gone (bankrupt or acquired)`} />
        <Kpi label="Price wars" value={String(active.filter((c) => c.priceWarUntil >= s.day).length)} deltaClass="bad" />
      </div>
      <Panel title="Revenue share in the markets you serve" actions={<RangePicker value={range} onChange={setRange} />}>
        <TimeChart reports={sliceRange(s.reports, range)} unit="pct" type="area" stacked series={[{ key: 'us', label: s.company.name, get: (x) => x.kpis.marketShare }, ...s.competitors.slice(0, 5).map((c) => ({ key: c.id, label: c.name, get: (x: typeof r) => x?.breakdown.competitorShare[c.id] ?? 0 }))]} />
      </Panel>
      <div className="grid g2">
        {active.map((c) => {
          const rev = competitorRevenue(s, c);
          const e = intelEstimate(s, c, rev, 1);
          const cust = intelEstimate(s, c, competitorCustomers(c), 2);
          const q = intelEstimate(s, c, c.quality, 3);
          const head = c.headcountHistory;
          const hireTrend = head.length >= 4 ? head[head.length - 1] - head[head.length - 4] : 0;
          const recent = s.news.filter((n) => n.headline.includes(c.name)).slice(0, 3);
          return (
            <Panel key={c.id} title={<span className="row">{c.name}<Badge>{c.strategy.replace('_', ' ')}</Badge>{c.priceWarUntil >= s.day && <Badge tone="bad">price war</Badge>}</span>} sub={`${c.fundingStage.replace('_', ' ')} · raised ~${money(c.totalRaised)} · ${c.markets.length} markets`}
              actions={<button type="button" className="btn sm" onClick={() => setTarget(c)}>M&A…</button>}>
              <div className="grid g3">
                <div><div className="faint small">Revenue / month (est.)</div><strong>{money(e.estimate)}</strong><div className="tiny faint">{money(e.low)} – {money(e.high)}</div></div>
                <div><div className="faint small">Customers (est.)</div><strong>{num(cust.estimate)}</strong></div>
                <div><div className="faint small">Product quality (est.)</div><strong>{q.estimate.toFixed(0)}</strong></div>
                <div><div className="faint small">Pricing vs market</div><strong>{pct(c.priceIndex - 1, 0)}</strong></div>
                <div><div className="faint small">Brand</div><strong>{c.brand.toFixed(0)}</strong></div>
                <div><div className="faint small">Hiring trend (3 mo)</div><strong className={hireTrend > 0 ? 'good' : hireTrend < 0 ? 'bad' : ''}>{hireTrend >= 0 ? '+' : ''}{hireTrend}</strong><div className="tiny faint">~{num(c.headcount)} staff</div></div>
              </div>
              <div className="small muted" style={{ marginTop: 8 }}>Markets: {c.markets.map((m) => MARKET_BY_ID[m]?.name).slice(0, 6).join(', ')}{c.markets.length > 6 ? '…' : ''} · marketing ~{money(intelEstimate(s, c, c.marketingSpend, 4).estimate)}/mo · {c.patents} patents</div>
              {recent.length > 0 && <ul className="small" style={{ margin: '6px 0 0', paddingLeft: 18 }}>{recent.map((n) => <li key={n.id}>{n.headline}</li>)}</ul>}
            </Panel>
          );
        })}
        {!active.length && <Empty>No active competitors. The market is yours.</Empty>}
      </div>
      {gone.length > 0 && <Panel title="Former competitors">{gone.map((c) => <div key={c.id} className="small">{c.name} — {c.status}</div>)}</Panel>}
      <DealModal c={target} onClose={() => setTarget(null)} />
    </div>
  );
}

function DealModal({ c, onClose }: { c: Competitor | null; onClose: () => void }) {
  const s = useSim();
  const [offer, setOffer] = useState(0);
  const [payment, setPayment] = useState<'cash' | 'stock'>('cash');
  const [gov, setGov] = useState<'our_ceo' | 'co_ceo' | 'their_ceo'>('co_ceo');
  if (!c) return <Modal open={false} onClose={onClose} title="">{null}</Modal>;
  const q = acquisitionQuote(s, c);
  const ours = computeValuation(s).value;
  const offerVal = offer || q.askingPrice;
  return (
    <Modal open onClose={onClose} title={`Acquire or merge with ${c.name}`} sub="Acquisitions add their customers, markets and part of their team; goodwill goes on the balance sheet; integration takes months." wide>
      <div className="grid g4">
        <Kpi label="Estimated valuation" value={money(q.valuation)} />
        <Kpi label="Asking price" value={money(q.askingPrice)} delta={q.distressed ? 'Distressed seller' : 'Includes control premium'} />
        <Kpi label="Integration cost" value={money(q.integrationCost)} />
        <Kpi label="Est. synergies" value={`${money(q.synergies)}/mo`} />
      </div>
      <div className="grid g2" style={{ marginTop: 14 }}>
        <Panel title="Acquisition">
          <Field label="Offer price"><NumberInput label="Offer" value={offerVal} onCommit={setOffer} suffix="₹" /></Field>
          <Field label="Pay with"><Seg label="Payment" value={payment} onChange={setPayment} options={[{ id: 'cash', label: 'Cash' }, { id: 'stock', label: 'Our shares' }]} /></Field>
          <p className="faint small">{payment === 'stock' ? `Issues ~${pct(offerVal / (ours + offerVal))} new shares, diluting all holders.` : `Cash after deal: ${money(s.finance.cash - offerVal)}.`}</p>
          <button type="button" className="btn primary" onClick={() => { const r = game.dispatch((st) => cmd.acquireCompetitor(st, c.id, offerVal, payment)); if (r && r.ok) onClose(); }}>Make offer</button>
        </Panel>
        <Panel title="Merger of equals">
          <p className="small muted">All-stock combination. {c.name} holders receive shares in proportion to value (theirs {money(q.valuation)} vs ours {money(ours)}).</p>
          <Field label="Leadership"><Seg label="Leadership" value={gov} onChange={setGov} options={[{ id: 'our_ceo', label: 'You lead' }, { id: 'co_ceo', label: 'Co-CEOs' }, { id: 'their_ceo', label: 'They lead' }]} /></Field>
          <p className="faint small">Keeping control is harder to negotiate; co-CEO structures slow integration.</p>
          <button type="button" className="btn" onClick={() => { const r = game.dispatch((st) => cmd.mergeWith(st, c.id, gov)); if (r && r.ok) onClose(); }}>Propose merger</button>
        </Panel>
      </div>
    </Modal>
  );
}

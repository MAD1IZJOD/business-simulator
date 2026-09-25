import { useState } from 'react';
import { useSim } from '../game/hooks';
import { game } from '../game/controller';
import * as cmd from '../../engine/commands';
import { Badge, Confirm, Empty, Field, Kpi, NumberInput, Panel, Seg, Tabs } from '../components/ui';
import { ForecastChart, reportLabel } from '../components/charts';
import type { Unit } from '../components/charts';
import { money, num, pct, signedPct } from '../format';
import type { Comparison, ProjectionSummary, WhatIfAction } from '../../engine/projection';
import { HIREABLE_ROLES } from '../../engine/data/roles';
import { MARKETS } from '../../engine/data/markets';
import { roleName } from '../../engine/context';
import { dateOf } from '../../engine/calendar';
import { computeValuation } from '../../engine/systems/valuation';
import { exitWaterfall } from '../../engine/systems/ma';
import type { Objective, RoleId } from '../../engine/types';

const OBJECTIVES: { id: Objective; label: string; focus: string }[] = [
  { id: 'profit', label: 'Maximize profit', focus: 'Watch gross margin, opex discipline and pricing power. Cut channels with CAC above LTV.' },
  { id: 'growth', label: 'Maximize growth', focus: 'Watch month-on-month growth, CAC payback and runway. Raise capital before you need it.' },
  { id: 'valuation', label: 'Maximize valuation', focus: 'Valuation rewards run-rate revenue × growth × margins. Balance both.' },
  { id: 'market_share', label: 'Maximize market share', focus: 'Expand markets, out-market rivals, consider acquisitions of weak competitors.' },
  { id: 'risk', label: 'Minimize risk', focus: 'Keep 18+ months runway, diversify suppliers and customers, invest in security and legal.' },
  { id: 'employees', label: 'Maximize employee satisfaction', focus: 'Pay at or above market, avoid crunch, fund welfare, keep offices uncrowded.' },
  { id: 'innovation', label: 'Maximize innovation', focus: 'Fund researchers and the lab, pursue patents and the next-gen platform.' },
];

export function Strategy() {
  const [tab, setTab] = useState<'objectives' | 'forecast' | 'whatif' | 'compare' | 'exit'>('objectives');
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Strategy & what-if</h1><p>Forecasts and what-if runs use the real engine on a copy of your company, across several possible futures. Nothing here changes the live company.</p></div></div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'objectives', label: 'Objectives' }, { id: 'forecast', label: 'Forecast' }, { id: 'whatif', label: 'What-if analysis' }, { id: 'compare', label: 'Compare plans' }, { id: 'exit', label: 'Exit options' }]} />
      {tab === 'objectives' && <Objectives />}
      {tab === 'forecast' && <Forecast />}
      {tab === 'whatif' && <WhatIf />}
      {tab === 'compare' && <Compare />}
      {tab === 'exit' && <Exit />}
    </div>
  );
}

function Objectives() {
  const s = useSim();
  const cur = OBJECTIVES.find((o) => o.id === s.company.objective)!;
  const r = s.reports[s.reports.length - 1];
  const recs: string[] = [];
  if (r) {
    if (cur.id === 'profit' && r.kpis.grossMargin < 0.4) recs.push(`Gross margin is ${pct(r.kpis.grossMargin)} — test a price increase in What-if.`);
    if ((cur.id === 'growth' || cur.id === 'valuation') && r.kpis.cac > 0 && r.kpis.ltv / r.kpis.cac > 3) recs.push('LTV is over 3× CAC: more marketing spend should pay back.');
    if (r.kpis.runwayMonths < 9) recs.push(`Runway is ${r.kpis.runwayMonths.toFixed(1)} months — plan financing now.`);
    if (cur.id === 'market_share' && s.competitors.some((c) => c.status === 'active' && c.cash < 0)) recs.push('A competitor is out of cash — it may be cheap to acquire.');
    if (cur.id === 'employees' && r.kpis.morale < 60) recs.push('Morale is below 60 — see the morale drivers in People.');
    if (cur.id === 'innovation' && s.research.budget === 0) recs.push('Your research lab has no budget.');
    if (cur.id === 'risk' && s.security.vulnerability > 50) recs.push('Cyber vulnerability is high — fund the security program.');
  }
  return (
    <div className="grid g2">
      <Panel title="Strategic objective" sub="Objectives shape recommendations — they never take actions for you.">
        <div className="stack-sm">
          {OBJECTIVES.map((o) => <button key={o.id} type="button" className="choice" aria-pressed={s.company.objective === o.id} onClick={() => game.dispatch((st) => cmd.setObjective(st, o.id), true)}><span className="title">{o.label}</span></button>)}
        </div>
      </Panel>
      <Panel title={`Focus: ${cur.label}`}>
        <p className="muted">{cur.focus}</p>
        <h4 style={{ margin: '14px 0 6px' }}>Recommendations from your numbers</h4>
        {recs.length ? <ul>{recs.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="faint small">Nothing urgent for this objective right now.</p>}
      </Panel>
    </div>
  );
}

function monthLabels(s: ReturnType<typeof useSim>, n: number): string[] {
  const out: string[] = [];
  const d = dateOf(s.startYear, s.startMonth, s.day);
  let y = d.year;
  let m = d.month;
  for (let i = 0; i < n; i++) {
    out.push(`${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${String(y).slice(2)}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

const METRICS: { id: keyof ProjectionSummary['series']; label: string; unit: Unit }[] = [
  { id: 'revenue', label: 'Revenue', unit: 'money' }, { id: 'netIncome', label: 'Net income', unit: 'money' }, { id: 'cash', label: 'Cash', unit: 'money' },
  { id: 'customers', label: 'Customers', unit: 'count' }, { id: 'valuation', label: 'Valuation', unit: 'money' }, { id: 'employees', label: 'Employees', unit: 'count' },
];

function Forecast() {
  const s = useSim();
  const [horizon, setHorizon] = useState(12);
  const [metric, setMetric] = useState<keyof ProjectionSummary['series']>('revenue');
  const [res, setRes] = useState<ProjectionSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try { setRes(await game.forecast(horizon, 6)); } catch (e) { game.toast(String(e), 'bad'); } finally { setBusy(false); }
  };
  const m = METRICS.find((x) => x.id === metric)!;
  const labels = monthLabels(s, horizon);
  const hist = s.reports.slice(-24);
  const actual = hist.map((r) => ({ label: reportLabel(r), value: metric === 'revenue' ? r.kpis.revenue : metric === 'netIncome' ? r.kpis.netIncome : metric === 'cash' ? r.kpis.cash : metric === 'customers' ? r.kpis.customers : metric === 'valuation' ? r.kpis.valuation : r.kpis.employees }));
  return (
    <Panel title="Forecast" sub="ACTUAL history, then a FORECAST band from 6 simulated futures assuming you change nothing. Not a guarantee." actions={<><Seg label="Horizon" value={horizon} onChange={setHorizon} options={[{ id: 3, label: 'Quarter' }, { id: 12, label: 'Year' }, { id: 24, label: '2 years' }]} /><button type="button" className="btn primary sm" onClick={run} disabled={busy}>{busy ? 'Simulating…' : 'Run forecast'}</button></>}>
      <Seg label="Metric" value={metric} onChange={setMetric} options={METRICS.map((x) => ({ id: x.id, label: x.label }))} />
      {!res ? <div style={{ marginTop: 12 }}><Empty>Run a forecast to project the next {horizon} months.</Empty></div> : (
        <>
          <ForecastChart label={m.label} unit={m.unit} actual={actual} forecast={res.series[metric].p50.map((v, i) => ({ label: labels[i] ?? `+${i + 1}`, p10: res.series[metric].p10[i], p50: v, p90: res.series[metric].p90[i] }))} />
          <div className="grid g4" style={{ marginTop: 10 }}>
            <Kpi label="Next month revenue (median)" value={money(res.series.revenue.p50[0])} />
            <Kpi label={`Revenue next ${res.months} months`} value={money(res.totals.revenue)} />
            <Kpi label="Ending cash (median)" value={money(res.totals.endCash)} />
            <Kpi label="Chance of running out of cash" value={pct(res.negativeCashProbability, 0)} deltaClass={res.negativeCashProbability > 0.2 ? 'bad' : 'muted'} delta={`Failure risk ${pct(res.failureProbability, 0)}`} />
          </div>
        </>
      )}
    </Panel>
  );
}

type ActionType = WhatIfAction['type'];

function ActionBuilder({ onAdd }: { onAdd: (a: WhatIfAction) => void }) {
  const s = useSim();
  const [type, setType] = useState<ActionType>('price');
  const [pctV, setPctV] = useState(10);
  const [role, setRole] = useState<RoleId>('engineer');
  const [count, setCount] = useState(5);
  const [market, setMarket] = useState(MARKETS.find((m) => !s.markets.find((x) => x.id === m.id)?.entered)?.id ?? 'us');
  const [amount, setAmount] = useState(10000000);
  const build = (): WhatIfAction => {
    switch (type) {
      case 'price': return { type, pct: pctV };
      case 'hire': return { type, role, count };
      case 'layoff': return { type, pct: pctV };
      case 'enter_market': return { type, marketId: market };
      case 'marketing': return { type, pct: pctV };
      case 'demand_shock': return { type, pct: pctV };
      case 'loan': return { type, kind: 'bank', amount };
      case 'equity': return { type, amount };
    }
  };
  return (
    <div className="grid g4" style={{ alignItems: 'end' }}>
      <Field label="Change"><select className="input" value={type} onChange={(e) => setType(e.target.value as ActionType)}>
        <option value="price">Change price by %</option><option value="hire">Hire people</option><option value="layoff">Lay off % of staff</option><option value="enter_market">Enter a market</option><option value="marketing">Change marketing by %</option><option value="demand_shock">Demand shock (±%)</option><option value="loan">Take a bank loan</option><option value="equity">Raise equity</option>
      </select></Field>
      {(type === 'price' || type === 'layoff' || type === 'marketing' || type === 'demand_shock') && <Field label="Percent"><NumberInput label="Percent" value={pctV} min={-90} max={500} onCommit={setPctV} suffix="%" /></Field>}
      {type === 'hire' && <><Field label="Role"><select className="input" value={role} onChange={(e) => setRole(e.target.value as RoleId)}>{HIREABLE_ROLES.map((r) => <option key={r.id} value={r.id}>{roleName(s, r.id)}</option>)}</select></Field><Field label="Count"><NumberInput label="Count" value={count} min={1} max={200} onCommit={setCount} /></Field></>}
      {type === 'enter_market' && <Field label="Market"><select className="input" value={market} onChange={(e) => setMarket(e.target.value)}>{MARKETS.filter((m) => !s.markets.find((x) => x.id === m.id)?.entered).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>}
      {(type === 'loan' || type === 'equity') && <Field label="Amount"><NumberInput label="Amount" value={amount} min={1} onCommit={setAmount} suffix="₹" /></Field>}
      <button type="button" className="btn" onClick={() => onAdd(build())}>Add to plan</button>
    </div>
  );
}

function describe(a: WhatIfAction): string {
  switch (a.type) {
    case 'price': return `Price ${signedPct(a.pct / 100, 0)}`;
    case 'hire': return `Hire ${a.count} ${a.role.replace('_', ' ')}`;
    case 'layoff': return `Lay off ${a.pct}% of staff`;
    case 'enter_market': return `Enter ${MARKETS.find((m) => m.id === a.marketId)?.name}`;
    case 'marketing': return `Marketing ${signedPct(a.pct / 100, 0)}`;
    case 'demand_shock': return `Demand ${signedPct(a.pct / 100, 0)}`;
    case 'loan': return `Borrow ${money(a.amount)}`;
    case 'equity': return `Raise ${money(a.amount)} equity`;
  }
}

function PlanList({ plan, setPlan, title }: { plan: WhatIfAction[]; setPlan: (p: WhatIfAction[]) => void; title: string }) {
  return (
    <div className="stack-sm">
      <h4>{title}</h4>
      {plan.length === 0 ? <span className="faint small">No changes (status quo).</span> : plan.map((a, i) => <div key={i} className="row between small"><span>{describe(a)}</span><button type="button" className="btn sm ghost" onClick={() => setPlan(plan.filter((_, j) => j !== i))} aria-label={`Remove ${describe(a)}`}>✕</button></div>)}
    </div>
  );
}

function ComparisonView({ c }: { c: Comparison }) {
  const rows: { label: string; a: number; b: number; unit: Unit; higherBetter?: boolean }[] = [
    { label: 'Total revenue', a: c.baseline.totals.revenue, b: c.alternative.totals.revenue, unit: 'money' },
    { label: 'Total net income', a: c.baseline.totals.netIncome, b: c.alternative.totals.netIncome, unit: 'money' },
    { label: 'Ending cash', a: c.baseline.totals.endCash, b: c.alternative.totals.endCash, unit: 'money' },
    { label: 'Ending customers', a: c.baseline.totals.endCustomers, b: c.alternative.totals.endCustomers, unit: 'count' },
    { label: 'Ending valuation', a: c.baseline.totals.endValuation, b: c.alternative.totals.endValuation, unit: 'money' },
    { label: 'Risk: cash goes negative', a: c.baseline.negativeCashProbability, b: c.alternative.negativeCashProbability, unit: 'pct', higherBetter: false },
    { label: 'Risk: company fails', a: c.baseline.failureProbability, b: c.alternative.failureProbability, unit: 'pct', higherBetter: false },
  ];
  const f = (v: number, u: Unit) => (u === 'money' ? money(v) : u === 'pct' ? pct(v, 0) : num(v));
  return (
    <table className="data" style={{ marginTop: 12 }}>
      <thead><tr><th>Median over {c.baseline.runs} futures, {c.baseline.months} months</th><th className="num">Plan A</th><th className="num">Plan B</th><th className="num">Difference</th></tr></thead>
      <tbody>{rows.map((r) => {
        const d = r.b - r.a;
        const good = (d > 0) === (r.higherBetter ?? true);
        return <tr key={r.label}><td>{r.label}</td><td className="num">{f(r.a, r.unit)}</td><td className="num">{f(r.b, r.unit)}</td><td className={`num ${Math.abs(d) < 1e-9 ? '' : good ? 'good' : 'bad'}`}>{d >= 0 ? '+' : ''}{f(d, r.unit)}</td></tr>;
      })}</tbody>
    </table>
  );
}

function WhatIf() {
  const [plan, setPlan] = useState<WhatIfAction[]>([]);
  const [months, setMonths] = useState(12);
  const [res, setRes] = useState<Comparison | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try { setRes(await game.compare([], plan, months, 5)); } catch (e) { game.toast(String(e), 'bad'); } finally { setBusy(false); }
  };
  return (
    <Panel title="What happens if…?" sub="Build a change, then compare it against doing nothing across the same 5 simulated futures." actions={<><Seg label="Horizon" value={months} onChange={setMonths} options={[{ id: 3, label: '3 mo' }, { id: 12, label: '12 mo' }, { id: 24, label: '24 mo' }]} /><button type="button" className="btn primary sm" disabled={!plan.length || busy} onClick={run}>{busy ? 'Simulating…' : 'Simulate'}</button></>}>
      <ActionBuilder onAdd={(a) => setPlan([...plan, a])} />
      <div className="sep" />
      <PlanList plan={plan} setPlan={setPlan} title="Your what-if plan" />
      {res && <ComparisonView c={res} />}
      {res && <p className="faint small" style={{ marginTop: 8 }}>Plan A = status quo. Plan B = your changes. Hires in projections go through normal hiring with auto-hire.</p>}
    </Panel>
  );
}

function Compare() {
  const [a, setA] = useState<WhatIfAction[]>([]);
  const [b, setB] = useState<WhatIfAction[]>([]);
  const [res, setRes] = useState<Comparison | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<'a' | 'b'>('b');
  return (
    <Panel title="Compare two plans" sub="Current plan vs alternative plan over 12 months, same random futures." actions={<button type="button" className="btn primary sm" disabled={busy} onClick={async () => { setBusy(true); try { setRes(await game.compare(a, b, 12, 5)); } finally { setBusy(false); } }}>{busy ? 'Simulating…' : 'Compare'}</button>}>
      <Seg label="Editing plan" value={editing} onChange={setEditing} options={[{ id: 'a', label: 'Edit plan A (current)' }, { id: 'b', label: 'Edit plan B (alternative)' }]} />
      <div style={{ marginTop: 10 }}><ActionBuilder onAdd={(x) => (editing === 'a' ? setA([...a, x]) : setB([...b, x]))} /></div>
      <div className="grid g2" style={{ marginTop: 12 }}>
        <PlanList plan={a} setPlan={setA} title="Plan A" />
        <PlanList plan={b} setPlan={setB} title="Plan B" />
      </div>
      {res && <ComparisonView c={res} />}
    </Panel>
  );
}

function Exit() {
  const s = useSim();
  const [pctBuy, setPctBuy] = useState(100);
  const [confirmSale, setConfirmSale] = useState(false);
  const v = computeValuation(s).value;
  const w = exitWaterfall(s, v * 0.9);
  return (
    <div className="grid g2">
      <Panel title="Private sale" sub="Sell the whole company to a private-equity buyer at ~90% of current valuation. Ends the game.">
        <div className="grid g2">
          <Kpi label="Sale price" value={money(v * 0.9)} />
          <Kpi label="Your proceeds" value={money(w.founder)} delta="after debt and investor preferences" />
        </div>
        <button type="button" className="btn danger" style={{ marginTop: 12 }} onClick={() => setConfirmSale(true)} disabled={s.status !== 'running'}>Sell the company</button>
        <p className="faint small" style={{ marginTop: 8 }}>Strategic buyers may also approach you with acquisition offers (usually at a premium) once you're valuable enough.</p>
        <Confirm open={confirmSale} onClose={() => setConfirmSale(false)} danger title="Sell the company?" confirmLabel="Sell" body={<p>This ends the game. You will receive about {money(w.founder)}.</p>} onConfirm={() => game.dispatch((st) => cmd.privateSale(st))} />
      </Panel>
      <Panel title="Founder buyout" sub="The company buys back outside investors' shares at the current valuation, raising your ownership. Consider borrowing to fund it.">
        <Field label="Share of investor stakes to buy back"><NumberInput label="Buyback percent" value={pctBuy} min={1} max={100} onCommit={setPctBuy} suffix="%" /></Field>
        <p className="small muted" style={{ marginTop: 6 }}>Investors hold {pct(s.capTable.filter((h) => h.kind === 'investor').reduce((a, h) => a + h.shares, 0) / Math.max(1, s.capTable.reduce((a, h) => a + h.shares, 0)))} of the company.</p>
        <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => game.dispatch((st) => cmd.founderBuyout(st, pctBuy / 100))}>Execute buyout</button>
        {s.outcome && <Badge tone="info">Game ended: {s.outcome.title}</Badge>}
      </Panel>
    </div>
  );
}

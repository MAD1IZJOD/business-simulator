import { useState } from 'react';
import { useSim } from '../game/hooks';
import { Empty, Field, Panel, Seg } from '../components/ui';
import { RangePicker, TimeChart, sliceRange, useRange, reportLabel, HBars } from '../components/charts';
import type { SeriesDef, Unit } from '../components/charts';
import { money, num, pct } from '../format';
import { MARKET_BY_ID } from '../../engine/data/markets';
import { SEGMENTS } from '../../engine/data/segments';
import { CHANNELS } from '../../engine/data/channels';
import { DEPARTMENTS } from '../../engine/data/roles';
import type { MonthlyReport } from '../../engine/types';

type Dim = 'product' | 'segment' | 'market' | 'channel' | 'department';
type Measure = 'revenue' | 'customers' | 'new' | 'spend' | 'cac' | 'headcount' | 'salary';

const DIM_MEASURES: Record<Dim, Measure[]> = {
  product: ['revenue', 'customers'],
  segment: ['revenue', 'customers', 'new'],
  market: ['revenue', 'customers'],
  channel: ['new', 'spend', 'cac'],
  department: ['headcount', 'salary'],
};

function dimData(r: MonthlyReport, dim: Dim, measure: Measure): Record<string, number> {
  const b = r.breakdown;
  switch (dim) {
    case 'product': return measure === 'revenue' ? b.revenueByProduct : b.customersByProduct;
    case 'segment': return measure === 'revenue' ? b.revenueBySegment : measure === 'new' ? {} : b.customersBySegment;
    case 'market': return measure === 'revenue' ? b.revenueByMarket : b.customersByMarket;
    case 'channel': {
      if (measure === 'new') return b.newByChannel;
      if (measure === 'spend') return b.spendByChannel;
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(b.spendByChannel)) if ((b.newByChannel[k] ?? 0) > 0.05) out[k] = v / b.newByChannel[k];
      return out;
    }
    case 'department': return measure === 'headcount' ? b.headcountByDept : b.salaryByDept;
  }
}

const KPI_CHARTS: { id: string; label: string; unit: Unit; series: SeriesDef[] }[] = [
  { id: 'revenue', label: 'Revenue', unit: 'money', series: [{ key: 'r', label: 'Revenue', get: (x) => x.kpis.revenue }] },
  { id: 'profit', label: 'Profit', unit: 'money', series: [{ key: 'n', label: 'Net income', get: (x) => x.kpis.netIncome }, { key: 'e', label: 'EBITDA', get: (x) => x.kpis.ebitda }] },
  { id: 'cash', label: 'Cash', unit: 'money', series: [{ key: 'c', label: 'Cash', get: (x) => x.kpis.cash }] },
  { id: 'customers', label: 'Customers', unit: 'count', series: [{ key: 'c', label: 'Customers', get: (x) => x.kpis.customers }] },
  { id: 'share', label: 'Market share', unit: 'pct', series: [{ key: 's', label: 'Share', get: (x) => x.kpis.marketShare }] },
  { id: 'valuation', label: 'Valuation', unit: 'money', series: [{ key: 'v', label: 'Valuation', get: (x) => x.kpis.valuation }] },
  { id: 'headcount', label: 'Headcount', unit: 'count', series: [{ key: 'h', label: 'Employees', get: (x) => x.kpis.employees }] },
  { id: 'cac', label: 'CAC & LTV', unit: 'money', series: [{ key: 'c', label: 'CAC', get: (x) => x.kpis.cac }, { key: 'l', label: 'LTV', get: (x) => x.kpis.ltv }] },
  { id: 'churn', label: 'Churn', unit: 'pct', series: [{ key: 'c', label: 'Churn', get: (x) => x.kpis.churnRate }] },
  { id: 'inventory', label: 'Inventory', unit: 'money', series: [{ key: 'i', label: 'Inventory value', get: (x) => x.kpis.inventoryValue }] },
  { id: 'stock', label: 'Stock price', unit: 'raw', series: [{ key: 'p', label: 'Share price', get: (x) => x.kpis.stockPrice }] },
];

export function Analytics() {
  const s = useSim();
  const [dim, setDim] = useState<Dim>('product');
  const [measure, setMeasure] = useState<Measure>('revenue');
  const [range, setRange] = useRange(12);
  const [chart, setChart] = useState('revenue');
  const reps = sliceRange(s.reports, range);
  const [monthIdx, setMonthIdx] = useState<number | null>(null);
  const idx = Math.min(monthIdx ?? s.reports.length - 1, s.reports.length - 1);
  const measures = DIM_MEASURES[dim];
  const m = measures.includes(measure) ? measure : measures[0];
  const name = (k: string) => (dim === 'product' ? s.products.find((p) => p.id === k)?.name ?? k : dim === 'market' ? MARKET_BY_ID[k]?.name ?? k : dim === 'segment' ? SEGMENTS[k as keyof typeof SEGMENTS]?.name ?? k : dim === 'channel' ? CHANNELS[k as keyof typeof CHANNELS]?.name ?? k.replace(/_/g, ' ') : DEPARTMENTS.find((d) => d.id === k)?.name ?? k);
  const unit: Unit = m === 'revenue' || m === 'spend' || m === 'cac' || m === 'salary' ? 'money' : 'count';
  const cur = s.reports[idx];
  const keys = new Set<string>();
  for (const r of reps) for (const k of Object.keys(dimData(r, dim, m))) keys.add(k);
  const top = [...keys].slice(0, 6);
  const kc = KPI_CHARTS.find((c) => c.id === chart)!;
  if (!s.reports.length) return <div><div className="page-head"><h1>Analytics & reports</h1></div><Empty>Analytics appear after the first month-end.</Empty></div>;
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Analytics & reports</h1><p>Slice the business by product, segment, geography, channel or department.</p></div></div>
      <Panel title="Business intelligence" actions={<RangePicker value={range} onChange={setRange} />}>
        <div className="row" style={{ marginBottom: 12 }}>
          <Field label="Dimension"><Seg label="Dimension" value={dim} onChange={(v) => { setDim(v); setMeasure(DIM_MEASURES[v][0]); }} options={[{ id: 'product', label: 'Product' }, { id: 'segment', label: 'Segment' }, { id: 'market', label: 'Geography' }, { id: 'channel', label: 'Channel' }, { id: 'department', label: 'Department' }]} /></Field>
          <Field label="Measure"><Seg label="Measure" value={m} onChange={setMeasure} options={measures.map((x) => ({ id: x, label: x === 'new' ? 'New customers' : x === 'cac' ? 'CAC' : x[0].toUpperCase() + x.slice(1) }))} /></Field>
          <Field label="Month"><select className="input" value={idx} onChange={(e) => setMonthIdx(Number(e.target.value))}>{s.reports.map((r, i) => <option key={i} value={i}>{reportLabel(r)}</option>)}</select></Field>
        </div>
        <div className="grid g2">
          <TimeChart reports={reps} unit={unit} type={dim === 'department' || m === 'cac' ? 'line' : 'area'} stacked={!(dim === 'department' || m === 'cac')} series={top.map((k) => ({ key: k, label: name(k), get: (r) => dimData(r, dim, m)[k] ?? 0 }))} />
          <div>
            <h4 style={{ marginBottom: 8 }}>{reportLabel(cur)}</h4>
            <HBars unit={unit} items={Object.entries(dimData(cur, dim, m)).map(([k, v]) => ({ label: name(k), value: v })).sort((a, b) => b.value - a.value).slice(0, 12)} />
          </div>
        </div>
      </Panel>
      <Panel title="KPI trends" actions={<RangePicker value={range} onChange={setRange} />}>
        <div className="row" style={{ marginBottom: 10 }}>
          {KPI_CHARTS.map((c) => <button key={c.id} type="button" className={`btn sm ${chart === c.id ? 'active' : ''}`} onClick={() => setChart(c.id)}>{c.label}</button>)}
        </div>
        <TimeChart reports={reps} unit={kc.unit} series={kc.series} height="lg" zeroLine={kc.id === 'profit'} />
      </Panel>
      <Panel title="Monthly KPI report" flush>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Month</th><th className="num">Revenue</th><th className="num">Growth</th><th className="num">Gross margin</th><th className="num">Net income</th><th className="num">Cash</th><th className="num">Customers</th><th className="num">Churn</th><th className="num">CAC</th><th className="num">LTV</th><th className="num">Employees</th><th className="num">Share</th></tr></thead>
            <tbody>{[...reps].reverse().map((r) => (
              <tr key={r.index}><td>{reportLabel(r)}</td><td className="num">{money(r.kpis.revenue)}</td><td className="num">{pct(r.kpis.growthMoM)}</td><td className="num">{pct(r.kpis.grossMargin)}</td><td className={`num ${r.kpis.netIncome < 0 ? 'bad' : ''}`}>{money(r.kpis.netIncome)}</td><td className="num">{money(r.kpis.cash)}</td><td className="num">{num(r.kpis.customers)}</td><td className="num">{pct(r.kpis.churnRate)}</td><td className="num">{money(r.kpis.cac)}</td><td className="num">{money(r.kpis.ltv)}</td><td className="num">{r.kpis.employees}</td><td className="num">{pct(r.kpis.marketShare, 2)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Insight history">
        {s.reports.slice().reverse().filter((r) => r.insights.length).slice(0, 12).map((r) => (
          <div key={r.index} style={{ marginBottom: 8 }}><strong className="small">{reportLabel(r)}</strong>{r.insights.map((i) => <div key={i.id} className="small muted">• {i.title} — {i.evidence.join(' · ')}</div>)}</div>
        ))}
        {!s.reports.some((r) => r.insights.length) && <Empty>No insights yet.</Empty>}
      </Panel>
    </div>
  );
}

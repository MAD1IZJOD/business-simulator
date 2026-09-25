import { useSim } from '../game/hooks';
import { useUi } from '../shell/nav';
import { Kpi, Panel, Badge, Bar, Empty } from '../components/ui';
import { RangePicker, TimeChart, sliceRange, useRange } from '../components/charts';
import { money, months, num, pct, signedPct, deltaClass } from '../format';
import { computeHealth } from '../../engine/systems/insights';
import { DecisionCard } from '../shell/DecisionCard';
import { formatDay } from '../../engine/calendar';
import { SCENARIO_BY_ID } from '../../engine/systems/scenarios';
import { launchedProducts } from '../../engine/context';

export function Dashboard() {
  const s = useSim();
  const ui = useUi();
  const [range, setRange] = useRange(12);
  const r = s.reports[s.reports.length - 1];
  const p = s.reports[s.reports.length - 2];
  const k = r?.kpis;
  const d = (a: number | undefined, b: number | undefined) => (a !== undefined && b !== undefined && b !== 0 ? a / Math.abs(b) - 1 : 0);
  const reps = sliceRange(s.reports, range);
  const health = computeHealth(s);
  const open = s.decisions.filter((x) => !x.resolved);
  const hasProduct = launchedProducts(s).length > 0;
  const sc = s.scenario;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="page-head">
        <div>
          <h1>{s.company.name}</h1>
          <p>{s.company.mission}</p>
        </div>
        <div className="row">
          <Badge tone="info">Objective: {s.company.objective.replace('_', ' ')}</Badge>
          <Badge tone={s.macro.phase === 'recession' ? 'bad' : s.macro.phase === 'boom' ? 'good' : ''}>Economy: {s.macro.phase}</Badge>
        </div>
      </div>

      {sc && (
        <Panel title={`Scenario: ${SCENARIO_BY_ID[sc.id]?.name}`} sub={`${sc.objectiveText}${sc.deadlineDay !== null ? ` · deadline ${formatDay(s, sc.deadlineDay)}` : ''}`} actions={sc.complete ? <Badge tone="good">Complete</Badge> : sc.failed ? <Badge tone="bad">Failed</Badge> : <Badge>{pct(sc.progress, 0)}</Badge>}>
          <Bar value={sc.progress} tone={sc.complete ? 'good' : sc.failed ? 'bad' : ''} label="Scenario progress" />
        </Panel>
      )}

      {!hasProduct && open.some((x) => x.kind === 'launch_strategy') && (
        <Panel title="Your first product is ready" sub={`You have ${money(s.finance.cash)}. Choose how to launch — this is your first real decision.`}>
          {open.filter((x) => x.kind === 'launch_strategy').map((x) => <DecisionCard key={x.id} d={x} />)}
        </Panel>
      )}

      <div className="grid g4">
        <Kpi hero label="Revenue (last month)" value={k ? money(k.revenue) : '–'} delta={p ? `${signedPct(d(k?.revenue, p.kpis.revenue))} vs prior month` : 'No completed month yet'} deltaClass={deltaClass(d(k?.revenue, p?.kpis.revenue))} onWhy={() => ui.explain('revenue')} />
        <Kpi hero label="Net profit" value={k ? money(k.netIncome) : '–'} delta={k ? `EBITDA ${money(k.ebitda)}` : ''} deltaClass={k && k.netIncome >= 0 ? 'good' : 'bad'} onWhy={() => ui.explain('profit')} />
        <Kpi hero label="Cash" value={money(s.finance.cash)} delta={k ? `${k.burn > 0 ? `Burn ${money(k.burn)}/mo` : `Generating ${money(-k.burn)}/mo`}` : ''} deltaClass={k && k.burn > 0 ? 'bad' : 'good'} onWhy={() => ui.explain('cash')} />
        <Kpi hero label="Runway" value={k ? months(k.runwayMonths) : '–'} hint="Cash ÷ monthly burn. ∞ means cash-flow positive." delta={k && k.runwayMonths < 6 ? 'Critical: raise, borrow or cut' : 'Months until cash runs out'} deltaClass={k && k.runwayMonths < 6 ? 'bad' : 'muted'} />
      </div>
      <div className="grid g6">
        <Kpi label="Growth (MoM)" value={k ? signedPct(k.growthMoM) : '–'} deltaClass={deltaClass(k?.growthMoM ?? 0)} />
        <Kpi label="Customers" value={k ? num(k.customers) : '–'} delta={k ? `+${num(k.newCustomers, 1)} / −${num(k.churned, 1)}` : ''} onWhy={() => ui.explain('customers')} />
        <Kpi label="Churn / mo" value={k ? pct(k.churnRate) : '–'} onWhy={() => ui.explain('churn')} hint="Share of customers lost per month." />
        <Kpi label="CAC" value={k && k.cac > 0 ? money(k.cac) : '–'} onWhy={() => ui.explain('cac')} hint="Acquisition spend ÷ new customers." />
        <Kpi label="LTV" value={k && k.ltv > 0 ? money(k.ltv) : '–'} delta={k && k.cac > 0 && k.ltv > 0 ? `${(k.ltv / k.cac).toFixed(1)}× CAC` : ''} deltaClass={k && k.cac > 0 && k.ltv / k.cac >= 3 ? 'good' : 'warn'} hint="Lifetime gross profit per customer." />
        <Kpi label="Market share" value={k ? pct(k.marketShare, 2) : '–'} onWhy={() => ui.explain('marketShare')} hint="Share of revenue in the markets you serve." />
        <Kpi label="Valuation" value={money(s.metrics.valuation)} onWhy={() => ui.explain('valuation')} />
        <Kpi label="Gross margin" value={k ? pct(k.grossMargin) : '–'} onWhy={() => ui.explain('grossMargin')} />
        <Kpi label="Employees" value={num(s.employees.length)} delta={`${s.openings.reduce((a, j) => a + j.count - j.filled, 0)} open roles`} />
        <Kpi label="Productivity" value={k ? k.productivity.toFixed(2) : '–'} hint="Average employee output multiplier (1.0 = typical)." onWhy={() => ui.explain('morale')} />
        <Kpi label="Inventory" value={k ? money(k.inventoryValue) : '–'} delta={k && k.lostUnits > 0 ? `${num(k.lostUnits)} units lost to stockouts` : ''} deltaClass="bad" />
        <Kpi label="Brand" value={s.company.brand.toFixed(0)} onWhy={() => ui.explain('brand')} hint="0–100. Lifts conversion, pricing power and retention." />
      </div>

      <div className="grid g2">
        <Panel title="Revenue & profit" actions={<RangePicker value={range} onChange={setRange} />}>
          <TimeChart reports={reps} unit="money" zeroLine series={[{ key: 'rev', label: 'Revenue', get: (x) => x.kpis.revenue }, { key: 'ni', label: 'Net income', get: (x) => x.kpis.netIncome }]} />
        </Panel>
        <Panel title="Cash & customers" actions={<RangePicker value={range} onChange={setRange} />}>
          <TimeChart reports={reps} unit="money" type="area" series={[{ key: 'cash', label: 'Cash', get: (x) => x.kpis.cash }]} height="sm" />
          <TimeChart reports={reps} unit="count" series={[{ key: 'c', label: 'Customers', get: (x) => x.kpis.customers, color: 'var(--chart-2)' }]} height="sm" />
        </Panel>
      </div>

      <div className="grid g3">
        <Panel title="Business health" sub="Separate indicators — not one arbitrary score">
          <div className="grid g2" style={{ gap: 8 }}>
            {health.map((h) => (
              <div key={h.id} className="health" title={h.factors.map((f) => `${f.label}: ${f.value}`).join('\n')}>
                <div className="row between"><span className="small muted">{h.label}</span><span className={`score ${h.score >= 65 ? 'good' : h.score >= 40 ? 'warn' : 'bad'}`}>{h.score.toFixed(0)}</span></div>
                <Bar value={h.score / 100} tone={h.score >= 65 ? 'good' : h.score >= 40 ? 'warn' : 'bad'} label={h.label} />
                <span className="tiny faint">{h.summary}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Alerts" sub="From the current state of the company" actions={<button type="button" className="btn sm ghost" onClick={() => ui.go('news')}>All</button>}>
          {s.alerts.length === 0 ? <Empty>No alerts. Advance to month-end to refresh.</Empty> : (
            <div className="list">
              {s.alerts.slice(0, 7).map((a) => (
                <button key={a.id} type="button" className="list-item" style={{ background: 'none', border: 0, borderBottom: '1px solid var(--line)', textAlign: 'left', cursor: a.link ? 'pointer' : 'default', color: 'inherit' }} onClick={() => a.link && ui.go(a.link as never)}>
                  <span className={`dot ${a.severity === 'critical' ? 'bad' : a.severity === 'warning' ? 'warn' : a.severity === 'opportunity' ? 'good' : 'info'}`} aria-hidden="true" />
                  <div><div><span className="sr-only">{a.severity}: </span>{a.title}</div><div className="small muted">{a.detail}</div></div>
                </button>
              ))}
            </div>
          )}
        </Panel>
        <Panel title="Insights" sub={r ? 'Generated from last month’s numbers' : ''}>
          {!r || r.insights.length === 0 ? <Empty>No notable patterns yet.</Empty> : (
            <div className="list">
              {r.insights.map((i) => (
                <div key={i.id} className="list-item">
                  <span className={`dot ${i.tone === 'positive' ? 'good' : i.tone === 'negative' ? 'bad' : 'info'}`} aria-hidden="true" />
                  <div><strong>{i.title}</strong><div className="small muted">{i.detail}</div><div className="tiny faint">{i.evidence.join(' · ')}</div></div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid g2">
        <Panel title="Decisions waiting" actions={<button type="button" className="btn sm ghost" onClick={() => ui.go('decisions')}>Open inbox ({open.length})</button>}>
          {open.length === 0 ? <Empty>Nothing needs your attention right now.</Empty> : <div className="stack">{open.slice(0, 2).map((x) => <DecisionCard key={x.id} d={x} compact />)}</div>}
        </Panel>
        <Panel title="Latest news" actions={<button type="button" className="btn sm ghost" onClick={() => ui.go('news')}>All news</button>}>
          <div className="list">
            {s.news.slice(0, 6).map((n) => (
              <div key={n.id} className="list-item">
                <span className={`dot ${n.sentiment === 'positive' ? 'good' : n.sentiment === 'negative' ? 'bad' : 'info'}`} aria-hidden="true" />
                <div><div>{n.headline}</div><div className="tiny faint">{formatDay(s, n.day)} · {n.category}</div></div>
              </div>
            ))}
            {s.news.length === 0 && <Empty>No news yet.</Empty>}
          </div>
        </Panel>
      </div>
    </div>
  );
}

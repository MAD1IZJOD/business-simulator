import { useSim } from '../game/hooks';
import { useUi } from '../shell/nav';
import { Badge, Bar, Empty, Kpi, Panel } from '../components/ui';
import { HBars, RangePicker, TimeChart, sliceRange, useRange } from '../components/charts';
import { money, num, pct } from '../format';
import { SEGMENTS } from '../../engine/data/segments';
import { segmentsFor, industryOf } from '../../engine/context';
import { segmentPotential } from '../../engine/systems/market';
import { msKey } from '../../engine/util';
import { MARKET_BY_ID } from '../../engine/data/markets';
import { activeContracts, customerConcentration, deliveredUptime } from '../../engine/systems/contracts';
import { pmfComponents } from '../../engine/systems/reputation';
import { responseHoursFor, TICKETS_PER_AGENT } from '../../engine/systems/support';
import { formatDay } from '../../engine/calendar';

const STAGES: [keyof import('../../engine/types').FunnelCounts, string][] = [
  ['inMarket', 'In-market buyers'], ['aware', 'Aware of us'], ['interest', 'Interested'], ['visit', 'Visited'],
  ['consideration', 'Considered'], ['trial', 'Tried / evaluated'], ['purchase', 'Purchased'], ['activation', 'Activated'],
];

export function Customers() {
  const s = useSim();
  const ui = useUi();
  const [range, setRange] = useRange(12);
  const r = s.reports[s.reports.length - 1];
  const k = r?.kpis;
  const segs = segmentsFor(s);
  const entered = s.markets.filter((m) => m.entered);
  const f = r?.funnel;
  const conc = customerConcentration(s, k?.revenue ?? 0);
  const contracts = activeContracts(s);
  const pmf = pmfComponents(s);
  const ind = industryOf(s);
  const agents = s.employees.filter((e) => e.role === 'support_agent').length;
  const tickets = r ? s.month.tickets : 0;

  return (
    <div className="stack">
      <div className="page-head"><div><h1>Customers</h1><p>Aggregated customer populations by segment and market, the acquisition funnel, retention and support.</p></div></div>
      <div className="grid g6">
        <Kpi label="Customers" value={k ? num(k.customers) : '–'} onWhy={() => ui.explain('customers')} />
        <Kpi label="Free users" value={k ? num(k.freeUsers) : '–'} hint="Freemium free tier or ad-supported users." />
        <Kpi label="Churn / month" value={k ? pct(k.churnRate) : '–'} delta={`Industry typical ${pct(ind.baseChurn)}`} onWhy={() => ui.explain('churn')} />
        <Kpi label="ARPU / month" value={k ? money(k.arpu) : '–'} />
        <Kpi label="Satisfaction" value={k ? k.satisfaction.toFixed(0) : '–'} delta={`${s.company.reviewRating.toFixed(1)}★ reviews`} />
        <Kpi label="Product-market fit" value={s.company.pmf.toFixed(0)} onWhy={() => ui.explain('pmf')} hint="Blend of retention, satisfaction, organic growth, referrals, activation and willingness to pay." />
      </div>

      <div className="grid g2">
        <Panel title="Acquisition funnel" sub="Last month. Conversion rate between each stage.">
          {!f ? <Empty>Complete a month to see the funnel.</Empty> : (
            <div className="stack-sm">
              {STAGES.map(([key, label], i) => {
                const v = f[key];
                const prev = i > 0 ? f[STAGES[i - 1][0]] : 0;
                const top = Math.max(1, f.aware);
                return (
                  <div key={key} className="stack-sm" style={{ gap: 2 }}>
                    <div className="row between small"><span>{label}</span><span className="num">{num(v, 1)}{i > 1 && prev > 0 ? <span className="faint"> · {pct(v / prev)} of previous</span> : ''}</span></div>
                    <Bar value={i === 0 ? 1 : v / top} label={label} />
                  </div>
                );
              })}
              <div className="row small muted" style={{ marginTop: 6, gap: 16 }}>
                <span>Referrals entering: <strong>{num(f.referral, 1)}</strong></span>
                <span>Churned: <strong>{num(f.churn, 1)}</strong></span>
                <span>Expansion: <strong>{num(f.expansion, 1)}</strong> customer-equivalents</span>
              </div>
            </div>
          )}
        </Panel>
        <Panel title="Customers & churn" actions={<RangePicker value={range} onChange={setRange} />}>
          <TimeChart reports={sliceRange(s.reports, range)} unit="count" type="area" series={[{ key: 'c', label: 'Customers', get: (x) => x.kpis.customers }]} height="sm" />
          <TimeChart reports={sliceRange(s.reports, range)} unit="pct" series={[{ key: 'ch', label: 'Monthly churn', get: (x) => x.kpis.churnRate, color: 'var(--chart-4)' }]} height="sm" />
        </Panel>
      </div>

      <Panel title="Customer segments" sub="Each segment reacts differently to price, quality, brand and support" flush>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Segment</th><th className="num">Our customers</th><th className="num">Potential (entered markets)</th><th className="num">Awareness</th><th className="num">Price sensitivity</th><th className="num">Quality sensitivity</th><th className="num">Loyalty</th><th>Sales</th></tr></thead>
            <tbody>
              {segs.map((sg) => {
                const d = SEGMENTS[sg];
                const pot = entered.reduce((a, m) => a + segmentPotential(s, m.id, sg), 0);
                const aw = entered.length ? entered.reduce((a, m) => a + (s.company.awareness[msKey(m.id, sg)] ?? 0), 0) / entered.length : 0;
                return (
                  <tr key={sg}>
                    <td><strong>{d.name}</strong>{sg === s.config.targetSegment && <> <Badge tone="info">target</Badge></>}<div className="tiny faint">{d.description}</div></td>
                    <td className="num">{num(r?.breakdown.customersBySegment[sg] ?? 0)}</td>
                    <td className="num">{num(pot)}</td>
                    <td className="num">{pct(aw)}</td>
                    <td className="num">{d.priceSensitivity.toFixed(1)}</td>
                    <td className="num">{d.qualitySensitivity.toFixed(1)}</td>
                    <td className="num">{(1 / d.churnMult).toFixed(1)}×</td>
                    <td>{d.salesLed ? 'Sales-led' : 'Self-serve'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid g3">
        <Panel title="Customer support" sub={`${agents} agents · ${TICKETS_PER_AGENT} tickets each per month`}>
          <div className="grid g2">
            <Kpi label="Response time" value={`${s.metrics.responseHours.toFixed(0)}h`} />
            <Kpi label="Tickets this month" value={num(tickets)} delta={`capacity ${num(s.month.ticketCapacity)}`} />
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>At the current pace, response time will be ~{responseHoursFor(s.month.tickets, s.month.ticketCapacity).toFixed(0)}h. Slow support lowers satisfaction and raises churn; hire support agents in People, or invest in AI (Research) to deflect tickets.</p>
          <button type="button" className="btn sm" style={{ marginTop: 8 }} onClick={() => ui.go('people')}>Hire support</button>
        </Panel>
        <Panel title="Product-market fit" sub="0–100 per indicator">
          <HBars unit="raw" items={pmf.map((c) => ({ label: c.label, value: c.value }))} />
        </Panel>
        <Panel title="Customers by market">
          {r ? <HBars unit="count" items={Object.entries(r.breakdown.customersByMarket).map(([m, v]) => ({ label: MARKET_BY_ID[m]?.name ?? m, value: v })).sort((a, b) => b.value - a.value)} /> : <Empty>No data yet.</Empty>}
        </Panel>
      </div>

      <Panel title="Enterprise contracts" sub={`Delivered uptime ≈ ${deliveredUptime(s).toFixed(2)}% · largest customer = ${pct(conc.share)} of revenue`} flush>
        {s.contracts.length === 0 ? <div style={{ padding: 16 }}><Empty>No large contracts yet. Enterprise buyers appear as opportunities when you sell to businesses (account executives help).</Empty></div> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Client</th><th>Status</th><th className="num">Annual value</th><th>Term</th><th>Billing</th><th className="num">SLA</th><th className="num">Satisfaction</th><th className="num">Renewal odds</th><th className="num">Penalties paid</th><th>Ends</th></tr></thead>
              <tbody>
                {s.contracts.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.client}</strong><div className="tiny faint">{SEGMENTS[c.segmentId].name}</div></td>
                    <td><Badge tone={c.status === 'churned' ? 'bad' : c.status === 'renewed' ? 'good' : 'info'}>{c.status}</Badge></td>
                    <td className="num">{money(c.annualValue)}</td>
                    <td>{c.durationMonths} mo</td>
                    <td>{c.paymentSchedule.replace('_', ' ')} · {c.paymentTermsDays}d</td>
                    <td className="num">{c.slaUptime}%</td>
                    <td className="num">{c.satisfaction.toFixed(0)}</td>
                    <td className="num">{pct(c.renewalProbability, 0)}</td>
                    <td className="num">{money(c.penaltiesPaid)}</td>
                    <td>{formatDay(s, c.endDay)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {contracts.length > 0 && conc.share > 0.3 && <p className="bad small" style={{ padding: '0 16px 12px' }}>Concentration risk: {conc.client} is {pct(conc.share)} of revenue.</p>}
      </Panel>
    </div>
  );
}

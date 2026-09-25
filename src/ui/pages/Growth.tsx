import { useState } from 'react';
import { useSim } from '../game/hooks';
import { game } from '../game/controller';
import { useUi } from '../shell/nav';
import * as cmd from '../../engine/commands';
import { Badge, Empty, Field, Kpi, NumberInput, Panel, Tabs, Tip } from '../components/ui';
import { RangePicker, TimeChart, sliceRange, useRange } from '../components/charts';
import { money, num, pct } from '../format';
import { CHANNELS, CHANNEL_IDS } from '../../engine/data/channels';
import { channelReach, marketingEfficiency, marketWeights, peopleReached, totalMarketingBudget } from '../../engine/systems/marketing';
import { pipelineTotals } from '../../engine/systems/sales';
import { EXPERIMENT_INFO } from '../../engine/systems/growth';
import { brandDrivers } from '../../engine/systems/reputation';
import { roleCapacity } from '../../engine/context';
import { formatDay } from '../../engine/calendar';
import type { Experiment, MarketingChannelId } from '../../engine/types';

export function Growth() {
  const [tab, setTab] = useState<'marketing' | 'sales' | 'brand' | 'experiments' | 'partners'>('marketing');
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Marketing & sales</h1><p>Spend buys reach with diminishing returns. Reach builds awareness; awareness feeds the funnel; the sales team closes business deals.</p></div></div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'marketing', label: 'Channels & attribution' }, { id: 'sales', label: 'Sales pipeline' }, { id: 'brand', label: 'Brand' }, { id: 'experiments', label: 'A/B tests' }, { id: 'partners', label: 'Partnerships' }]} />
      {tab === 'marketing' && <Channels />}
      {tab === 'sales' && <Sales />}
      {tab === 'brand' && <Brand />}
      {tab === 'experiments' && <Experiments />}
      {tab === 'partners' && <Partners />}
    </div>
  );
}

function Channels() {
  const s = useSim();
  const ui = useUi();
  const [range, setRange] = useRange(12);
  const r = s.reports[s.reports.length - 1];
  const eff = marketingEfficiency(s);
  const weights = marketWeights(s);
  const total = totalMarketingBudget(s);
  const marketers = roleCapacity(s, 'marketer');
  return (
    <>
      <div className="grid g4">
        <Kpi label="Monthly marketing budget" value={money(total)} />
        <Kpi label="Blended CAC" value={r && r.kpis.cac > 0 ? money(r.kpis.cac) : '–'} onWhy={() => ui.explain('cac')} />
        <Kpi label="Marketing efficiency" value={`×${eff.value.toFixed(2)}`} hint={eff.factors.map((f) => `${f.label}: ×${f.value.toFixed(2)}`).join(' · ')} delta={total > 0 && marketers * 600000 < total ? 'Understaffed: hire marketers' : `${marketers.toFixed(1)} marketer capacity`} deltaClass={total > 0 && marketers * 600000 < total ? 'warn' : 'muted'} />
        <Kpi label="Payback period" value={r && r.kpis.paybackMonths > 0 ? `${r.kpis.paybackMonths.toFixed(1)} mo` : '–'} hint="Months of gross profit to recover CAC." />
      </div>
      <Panel title="Channels" sub="Set a monthly budget per channel. Numbers on the right are from last month." flush>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Channel</th><th>Budget / month</th><th className="num">Reach (HQ) / mo</th><th className="num">Spent</th><th className="num">New customers</th><th className="num">CAC</th><th>Scales</th></tr></thead>
            <tbody>
              {CHANNEL_IDS.map((c: MarketingChannelId) => {
                const def = CHANNELS[c];
                const spent = r?.breakdown.spendByChannel[c] ?? 0;
                const n = r?.breakdown.newByChannel[c] ?? 0;
                const hq = s.config.hqMarket;
                const w = weights.get(hq) ?? 1;
                const reachPeople = def.costPerReach > 0 && !def.staffDriven ? peopleReached(s, c, s.marketing.budgets[c] * w, hq) : channelReach(s, c, s.marketing.budgets[c] * w, hq);
                return (
                  <tr key={c}>
                    <td><Tip text={def.description}><strong>{def.name}</strong></Tip>{def.minEffective > 0 && <div className="tiny faint">Effective from {money(def.minEffective)}/mo</div>}{def.staffDriven && <div className="tiny faint">Needs {c === 'outbound' ? 'SDRs' : 'account executives'}</div>}</td>
                    <td>
                      {c === 'referral' ? <NumberInput label="Referral reward" value={s.marketing.referralReward} onCommit={(v) => game.dispatch((st) => cmd.setReferralReward(st, v))} suffix="₹/referral" />
                        : c === 'affiliate' ? <NumberInput label="Affiliate commission" value={s.marketing.affiliateRate} max={40} onCommit={(v) => game.dispatch((st) => cmd.setAffiliateRate(st, v))} suffix="% commission" />
                          : <NumberInput label={`${def.name} budget`} value={s.marketing.budgets[c]} onCommit={(v) => game.dispatch((st) => cmd.setMarketingBudget(st, c, v))} suffix="₹" />}
                    </td>
                    <td className="num">{def.costPerReach > 0 && !def.staffDriven ? num(reachPeople) + ' people' : def.stock ? pct(reachPeople) : c === 'outbound' || c === 'direct_sales' ? pct(reachPeople) + ' of orgs' : '—'}</td>
                    <td className="num">{money(spent)}</td>
                    <td className="num">{num(n, 1)}</td>
                    <td className="num">{n > 0.05 && spent > 0 ? money(spent / n) : '—'}</td>
                    <td><Badge>{def.scalability}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="faint small" style={{ padding: '8px 16px 14px' }}>Organic sources last month: word of mouth {num(r?.breakdown.newByChannel.word_of_mouth ?? 0, 1)}, organic {num(r?.breakdown.newByChannel.organic ?? 0, 1)}, partners {num(r?.breakdown.newByChannel.partner ?? 0, 1)}. SEO authority {pct(s.marketing.seoStock)} · content library {pct(s.marketing.contentStock)}.</p>
      </Panel>
      <Panel title="Marketing spend vs new customers" actions={<RangePicker value={range} onChange={setRange} />}>
        <div className="grid g2">
          <TimeChart reports={sliceRange(s.reports, range)} unit="money" type="bar" series={[{ key: 'm', label: 'Marketing spend', get: (x) => x.kpis.marketingSpend }]} height="sm" />
          <TimeChart reports={sliceRange(s.reports, range)} unit="money" series={[{ key: 'cac', label: 'CAC', get: (x) => x.kpis.cac, color: 'var(--chart-4)' }, { key: 'ltv', label: 'LTV', get: (x) => x.kpis.ltv, color: 'var(--chart-2)' }]} height="sm" />
        </div>
      </Panel>
    </>
  );
}

function Sales() {
  const s = useSim();
  const ui = useUi();
  const t = pipelineTotals(s);
  const r = s.reports[s.reports.length - 1];
  const buckets = Object.values(s.sales.pipeline).filter((b) => b.lead + b.qualified + b.proposal + b.negotiation > 0.05);
  const stages: [keyof typeof t, string][] = [['lead', 'Lead'], ['qualified', 'Qualified'], ['proposal', 'Proposal'], ['negotiation', 'Negotiation']];
  return (
    <>
      <div className="grid g4">
        <Kpi label="Pipeline value (weighted)" value={r ? money(r.kpis.pipelineValue) : '–'} hint="Deals × annual value × stage probability." />
        <Kpi label="SDR capacity" value={roleCapacity(s, 'sdr').toFixed(1)} delta="qualifies ~80 leads/month each" />
        <Kpi label="Account executives" value={roleCapacity(s, 'account_executive').toFixed(1)} delta="~30 SMB or ~6 enterprise deals each" />
        <Kpi label="Account & CS managers" value={(roleCapacity(s, 'account_manager') + roleCapacity(s, 'cs_manager')).toFixed(1)} delta="reduce business churn" />
      </div>
      <Panel title="Pipeline" sub="Lead → Qualified → Proposal → Negotiation → Won / Lost. Enterprise and government deals go through sales; so do all business deals on enterprise or licensing models.">
        <div className="grid g4">
          {stages.map(([k, l]) => <div key={k} className="kpi"><span className="kpi-label">{l}</span><span className="kpi-value">{num(t[k], 1)}</span></div>)}
        </div>
        {buckets.length === 0 ? <div style={{ marginTop: 12 }}><Empty>No deals in the pipeline. Sales-led segments need awareness (events, direct sales, outbound) and sales staff.</Empty></div> : (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="data">
              <thead><tr><th>Product</th><th>Market</th><th>Segment</th><th className="num">Lead</th><th className="num">Qualified</th><th className="num">Proposal</th><th className="num">Negotiation</th></tr></thead>
              <tbody>{buckets.map((b) => <tr key={`${b.productId}${b.marketId}${b.segmentId}`}><td>{s.products.find((p) => p.id === b.productId)?.name}</td><td>{b.marketId}</td><td>{b.segmentId}</td><td className="num">{num(b.lead, 1)}</td><td className="num">{num(b.qualified, 1)}</td><td className="num">{num(b.proposal, 1)}</td><td className="num">{num(b.negotiation, 1)}</td></tr>)}</tbody>
            </table>
          </div>
        )}
        <div className="row" style={{ marginTop: 12 }}><button type="button" className="btn sm" onClick={() => ui.go('people')}>Hire sales staff</button><span className="faint small">Win rate depends on your product's appeal versus competitors, AE skill and brand.</span></div>
      </Panel>
    </>
  );
}

function Brand() {
  const s = useSim();
  const ui = useUi();
  const [range, setRange] = useRange(24);
  const drivers = brandDrivers(s);
  const target = 28 + drivers.reduce((a, d) => a + d.value, 0);
  return (
    <div className="grid g2">
      <Panel title={`Brand score ${s.company.brand.toFixed(1)} / 100`} sub={`Moving toward ${Math.max(0, Math.min(100, target)).toFixed(1)} at ~6% per month`} actions={<button type="button" className="why" onClick={() => ui.explain('brand')} aria-label="Why did brand change?">?</button>}>
        {drivers.map((d) => <div key={d.label} className="row between small" style={{ padding: '3px 0' }}><span>{d.label}</span><span className={`num ${d.value >= 0 ? 'good' : 'bad'}`}>{d.value >= 0 ? '+' : ''}{d.value.toFixed(1)}</span></div>)}
        <p className="faint small" style={{ marginTop: 8 }}>Brand lifts conversion, pricing power (lower price sensitivity), retention, candidate flow, investor interest and partnership offers.</p>
      </Panel>
      <Panel title="Brand & reputation over time" actions={<RangePicker value={range} onChange={setRange} />}>
        <TimeChart reports={sliceRange(s.reports, range)} unit="raw" series={[{ key: 'b', label: 'Brand', get: (x) => x.kpis.brand }, { key: 's', label: 'Satisfaction', get: (x) => x.kpis.satisfaction }]} />
        <div className="grid g4" style={{ marginTop: 8 }}>
          {(['customer', 'employer', 'investor', 'regulatory'] as const).map((k) => <div key={k} className="stack-sm"><span className="faint small">{k} reputation</span><strong className="num">{s.company.reputation[k].toFixed(0)}</strong></div>)}
        </div>
      </Panel>
    </div>
  );
}

function Experiments() {
  const s = useSim();
  const kinds = Object.keys(EXPERIMENT_INFO) as Experiment['kind'][];
  return (
    <>
      <Panel title="Run an A/B test" sub="Tests use your real traffic. More visitors and better analytics tech give tighter estimates. A noisy estimate can mislead you.">
        <div className="grid g4">
          {kinds.map((k) => (
            <div key={k} className="panel" style={{ background: 'var(--panel-2)' }}>
              <strong>{EXPERIMENT_INFO[k].name}</strong>
              <p className="small muted">{EXPERIMENT_INFO[k].stage}</p>
              <button type="button" className="btn sm primary" style={{ marginTop: 8 }} disabled={s.experiments.some((x) => x.kind === k && x.status === 'running')} onClick={() => game.dispatch((st) => cmd.startExperiment(st, k, st.products[0]?.id ?? null))}>Run 30 days ({money(EXPERIMENT_INFO[k].cost)})</button>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Results" flush>
        {s.experiments.length === 0 ? <div style={{ padding: 16 }}><Empty>No experiments yet.</Empty></div> : (
          <table className="data">
            <thead><tr><th>Test</th><th>Status</th><th className="num">Sample</th><th className="num">Estimated effect</th><th className="num">95% interval</th><th /></tr></thead>
            <tbody>
              {s.experiments.map((x) => (
                <tr key={x.id}>
                  <td>{EXPERIMENT_INFO[x.kind].name}<div className="tiny faint">started {formatDay(s, x.startDay)}</div></td>
                  <td><Badge tone={x.status === 'shipped' ? 'good' : x.status === 'running' ? 'info' : ''}>{x.status}</Badge></td>
                  <td className="num">{x.status === 'running' ? '…' : num(x.sample)}</td>
                  <td className="num">{x.status === 'running' ? '…' : x.kind === 'pricing' ? `elasticity ${x.estimate.toFixed(2)}` : `${x.estimate >= 0 ? '+' : ''}${(x.estimate * 100).toFixed(1)}%`}</td>
                  <td className="num">{x.status === 'running' ? '' : x.kind === 'pricing' ? `±${(x.stdError * 4 * 1.96).toFixed(2)}` : `±${(x.stdError * 196).toFixed(1)}%`}</td>
                  <td className="num">{x.status === 'complete' && x.kind !== 'pricing' && <div className="row" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn sm primary" onClick={() => game.dispatch((st) => cmd.shipExperiment(st, x.id))}>Ship variant</button><button type="button" className="btn sm" onClick={() => game.dispatch((st) => cmd.discardExperiment(st, x.id))}>Keep control</button></div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="faint small" style={{ padding: '8px 16px 14px' }}>Shipped improvements permanently change funnel conversion. Current multipliers: interest ×{s.marketing.funnelMods.interest.toFixed(3)}, consideration ×{s.marketing.funnelMods.consideration.toFixed(3)}, purchase ×{s.marketing.funnelMods.purchase.toFixed(3)}.</p>
      </Panel>
    </>
  );
}

function Partners() {
  const s = useSim();
  return (
    <Panel title="Partnerships" sub="Partners bring distribution, technology, customers, credibility, infrastructure or licensing royalties. Offers arrive as opportunities in your decision inbox." flush>
      {s.partnerships.length === 0 ? <div style={{ padding: 16 }}><Empty>No partnerships yet. A stronger brand attracts more offers.</Empty></div> : (
        <table className="data">
          <thead><tr><th>Partner</th><th>Type</th><th>Status</th><th className="num">Strength</th><th className="num">Revenue share</th><th className="num">Attributed revenue</th><th>Ends</th></tr></thead>
          <tbody>{s.partnerships.map((p) => <tr key={p.id}><td>{p.partner}</td><td>{p.kind}</td><td><Badge tone={p.status === 'active' ? 'good' : ''}>{p.status}</Badge></td><td className="num">{pct(p.strength, 0)}</td><td className="num">{pct(p.revenueShare, 0)}</td><td className="num">{money(p.attributedRevenue)}</td><td>{formatDay(s, p.endDay)}</td></tr>)}</tbody>
        </table>
      )}
      <div style={{ padding: 16 }}><Field label="Tip">{' '}<span className="small muted">B2B2C companies get more reach from partners.</span></Field></div>
    </Panel>
  );
}

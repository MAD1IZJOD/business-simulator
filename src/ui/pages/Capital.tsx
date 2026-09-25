import { useState } from 'react';
import { useSim } from '../game/hooks';
import { game } from '../game/controller';
import { useUi } from '../shell/nav';
import * as cmd from '../../engine/commands';
import { Badge, Bar, Empty, Field, Kpi, NumberInput, Panel, Tabs } from '../components/ui';
import { CHART_COLORS } from '../components/charts';
import { money, num, pct } from '../format';
import { ownership, roundEligibility } from '../../engine/systems/capital';
import { ipoReadiness } from '../../engine/systems/stock';
import { founderOwnership, totalShares } from '../../engine/context';
import { formatDay } from '../../engine/calendar';
import { ROUND_BY_KIND } from '../../engine/data/investors';
import { INVESTORS } from '../../engine/data/investors';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Pie, PieChart, Cell } from 'recharts';

export function Capital() {
  const [tab, setTab] = useState<'overview' | 'raise' | 'board' | 'public'>('overview');
  const s = useSim();
  const ui = useUi();
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Capital & funding</h1><p>Valuation, ownership, investors and the path to IPO.</p></div></div>
      <div className="grid g4">
        <Kpi label="Valuation" value={money(s.metrics.valuation)} onWhy={() => ui.explain('valuation')} />
        <Kpi label="Founder ownership" value={pct(founderOwnership(s))} />
        <Kpi label="Price per share" value={`₹${(s.metrics.valuation / Math.max(1, totalShares(s))).toFixed(2)}`} delta={`${num(totalShares(s))} shares`} />
        <Kpi label="Total raised" value={money(s.rounds.reduce((a, r) => a + r.amount, 0))} delta={`${s.rounds.length} rounds`} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'overview', label: 'Cap table' }, { id: 'raise', label: s.raise ? 'Fundraising (active)' : 'Fundraising' }, { id: 'board', label: 'Board' }, { id: 'public', label: s.company.isPublic ? 'Stock & shareholders' : 'IPO' }]} />
      {tab === 'overview' && <CapTable />}
      {tab === 'raise' && <Raise />}
      {tab === 'board' && <Board />}
      {tab === 'public' && <Public />}
    </div>
  );
}

function CapTable() {
  const s = useSim();
  const own = ownership(s);
  const [pool, setPool] = useState(10);
  const pps = s.metrics.valuation / Math.max(1, totalShares(s));
  return (
    <div className="grid g2">
      <Panel title="Cap table" flush>
        <table className="data">
          <thead><tr><th>Holder</th><th>Type</th><th className="num">Shares</th><th className="num">Ownership</th><th className="num">Invested</th><th className="num">Value now</th></tr></thead>
          <tbody>{own.map(({ holder: h, pct: p }) => <tr key={h.id}><td>{h.name}{h.round && <div className="tiny faint">{h.round}</div>}</td><td>{h.kind.replace('_', ' ')}</td><td className="num">{num(h.shares)}</td><td className="num">{pct(p, 2)}</td><td className="num">{money(h.invested)}</td><td className="num">{money(h.shares * pps)}</td></tr>)}</tbody>
        </table>
        <div className="row" style={{ padding: 16 }}>
          <Field label="Option pool target (% of company)"><NumberInput label="Option pool" value={pool} min={1} max={30} onCommit={setPool} suffix="%" /></Field>
          <button type="button" className="btn sm" onClick={() => game.dispatch((st) => cmd.createOptionPool(st, pool / 100))}>Create / top up pool</button>
          <span className="faint small">Senior hires receive options from the pool, raising loyalty.</span>
        </div>
      </Panel>
      <Panel title="Ownership">
        <div className="chart-box" role="img" aria-label="Ownership pie chart">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={own.map((o) => ({ name: o.holder.name, value: o.holder.shares }))} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" isAnimationActive={false}>
                {own.map((o, i) => <Cell key={o.holder.id} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => num(Number(v))} contentStyle={{ background: 'var(--panel-2)', border: '1px solid var(--line-2)', borderRadius: 8 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <h4 style={{ margin: '10px 0 6px' }}>Funding history</h4>
        {s.rounds.length === 0 ? <p className="faint small">Bootstrapped so far.</p> : s.rounds.map((r) => (
          <div key={r.day + r.kind} className="row between small" style={{ padding: '3px 0' }}><span>{ROUND_BY_KIND[r.kind]?.name ?? r.kind} · {r.investors.join(', ')}</span><span className="num">{money(r.amount)} at {money(r.postMoney)} post · {formatDay(s, r.day)}</span></div>
        ))}
      </Panel>
    </div>
  );
}

function Raise() {
  const s = useSim();
  const el = roundEligibility(s);
  const r = s.raise;
  const [asks, setAsks] = useState<Record<string, number>>({});
  return (
    <>
      {r ? (
        <Panel title={`${ROUND_BY_KIND[r.kind].name} in progress`} sub={`Started ${formatDay(s, r.startedDay)} · closes ${formatDay(s, r.closesDay)}. Term sheets expire after 21 days.`} actions={<button type="button" className="btn sm ghost" onClick={() => game.dispatch((st) => cmd.cancelRaise(st))}>Stop raising</button>}>
          {r.termSheets.length === 0 ? <Empty>Pitching investors… term sheets will arrive over the coming weeks if they're interested. Growth, margins, brand and the funding climate all matter.</Empty> : (
            <div className="stack">
              {r.termSheets.map((t) => {
                const post = t.preMoney + t.amount;
                return (
                  <div key={t.id} className="decision">
                    <div className="row between"><strong>{t.investorName}</strong><Badge tone={t.status === 'open' ? 'info' : t.status === 'accepted' ? 'good' : 'bad'}>{t.status}</Badge></div>
                    <div className="grid g4">
                      <div><div className="faint small">Investment</div><strong>{money(t.amount)}</strong></div>
                      <div><div className="faint small">Pre-money</div><strong>{money(t.preMoney)}</strong></div>
                      <div><div className="faint small">Dilution</div><strong>{pct(t.amount / post + t.optionPoolTopUp)}</strong>{t.optionPoolTopUp > 0 && <div className="tiny faint">incl. {pct(t.optionPoolTopUp, 0)} option pool</div>}</div>
                      <div><div className="faint small">Terms</div><span className="small">{t.liquidationPref}× preference · {t.boardSeat ? 'board seat' : 'no board seat'} · expects {pct(t.expectedGrowth, 0)} annual growth</span></div>
                    </div>
                    <p className="small muted">{INVESTORS.find((i) => i.id === t.investorId)?.description}</p>
                    {t.status === 'open' && (
                      <div className="row">
                        <button type="button" className="btn primary sm" onClick={() => game.dispatch((st) => cmd.acceptTermSheet(st, t.id))}>Accept</button>
                        <NumberInput label="Counter pre-money" value={asks[t.id] ?? Math.round(t.preMoney * 1.15)} onCommit={(v) => setAsks((a) => ({ ...a, [t.id]: v }))} width={140} />
                        <button type="button" className="btn sm" onClick={() => game.dispatch((st) => cmd.negotiateTermSheet(st, t.id, asks[t.id] ?? Math.round(t.preMoney * 1.15)))}>Counter at this pre-money</button>
                        <button type="button" className="btn sm ghost" onClick={() => game.dispatch((st) => cmd.declineTermSheet(st, t.id))}>Decline</button>
                        <span className="faint tiny">Expires {formatDay(s, t.expiresDay)}. Push too hard and they walk.</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      ) : null}
      <Panel title="Funding rounds" sub="Each round sets investor expectations; missing them erodes board confidence." flush>
        <table className="data">
          <thead><tr><th>Round</th><th className="num">Typical size</th><th>Eligibility</th><th /></tr></thead>
          <tbody>{el.map((e) => (
            <tr key={e.kind}>
              <td><strong>{e.name}</strong></td>
              <td className="num">{money(e.typicalSize[0])} – {money(e.typicalSize[1])}</td>
              <td className={e.eligible ? 'good small' : 'faint small'}>{e.reason}</td>
              <td className="num"><button type="button" className="btn sm primary" disabled={!e.eligible} onClick={() => game.dispatch((st) => cmd.startRaise(st, e.kind))}>Start raising</button></td>
            </tr>
          ))}</tbody>
        </table>
        <p className="faint small" style={{ padding: '8px 16px 14px' }}>Venture debt appears in Finance → Loans after a venture round.</p>
      </Panel>
    </>
  );
}

function Board() {
  const s = useSim();
  const b = s.board;
  return (
    <div className="grid g2">
      <Panel title={`Board confidence ${b.confidence.toFixed(0)} / 100`} sub={b.lastMeetingNote}>
        <Bar value={b.confidence / 100} tone={b.confidence > 60 ? 'good' : b.confidence > 35 ? 'warn' : 'bad'} label="Board confidence" />
        <p className="small muted" style={{ marginTop: 10 }}>{b.approvalsRequired ? 'Major actions (acquisitions, mergers, IPO, buyouts, new financing when confidence is very low) need board approval. Approval odds rise with confidence.' : 'You control the board: no approvals needed yet.'}</p>
        {b.expectations && <p className="small" style={{ marginTop: 6 }}>Investor expectation: <strong>{pct(b.expectations.growth, 0)}</strong> annual revenue growth and ≥{b.expectations.minRunwayMonths} months runway.</p>}
        {s.config.difficulty === 'brutal' && <p className="bad small" style={{ marginTop: 6 }}>Brutal: if investors control the company and confidence stays below 25 for 4 months, you will be replaced as CEO.</p>}
      </Panel>
      <Panel title="Members" flush>
        <table className="data">
          <thead><tr><th>Member</th><th>Role</th><th>Priority</th><th className="num">Satisfaction</th></tr></thead>
          <tbody>{b.members.map((m) => <tr key={m.id}><td>{m.name}</td><td>{m.kind}</td><td>{m.priority.replace('_', ' ')}</td><td className="num">{m.satisfaction.toFixed(0)}</td></tr>)}</tbody>
        </table>
      </Panel>
    </div>
  );
}

function Public() {
  const s = useSim();
  const [div, setDiv] = useState(s.finance.dividendPolicy.perShareQuarterly);
  const [bb, setBb] = useState(s.finance.buybackBudget);
  if (!s.company.isPublic || !s.stock) {
    const checks = ipoReadiness(s);
    return (
      <Panel title="IPO readiness" sub="Going public is never automatic: you must qualify, pay for preparation, and markets must cooperate on listing day.">
        <div className="stack-sm">
          {checks.map((c) => <div key={c.label} className="row between"><span><span className={c.ok ? 'good' : 'bad'} aria-hidden="true">{c.ok ? '✓' : '✗'}</span> {c.label}</span><span className="faint small">{c.ok ? 'met' : 'not met'} · {c.detail}</span></div>)}
        </div>
        {s.ipo ? <p className="good" style={{ marginTop: 12 }}>IPO preparation underway — listing on {formatDay(s, s.ipo.readyDay)} if market conditions hold.</p> : (
          <button type="button" className="btn primary" style={{ marginTop: 12 }} disabled={checks.some((c) => !c.ok)} onClick={() => game.dispatch((st) => cmd.startIpo(st))}>Begin IPO preparation (₹3 Cr)</button>
        )}
      </Panel>
    );
  }
  const st = s.stock;
  const data = st.history.map((h) => ({ day: h.day, label: formatDay(s, h.day), price: h.price }));
  return (
    <div className="grid g2">
      <Panel title={`Share price ₹${st.price.toFixed(2)}`} sub={`IPO price ₹${st.ipoPrice.toFixed(2)} · analysts: ${st.analystRating} · last EPS ₹${st.lastEps.toFixed(2)} vs consensus next ₹${st.consensusEps.toFixed(2)}`}>
        <div className="chart-box" role="img" aria-label="Share price history">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-3)', fontSize: 11 }} minTickGap={30} />
              <YAxis tick={{ fill: 'var(--text-3)', fontSize: 11 }} width={60} />
              <Tooltip contentStyle={{ background: 'var(--panel-2)', border: '1px solid var(--line-2)', borderRadius: 8 }} />
              <Line dataKey="price" stroke="var(--chart-1)" dot={false} strokeWidth={2} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>
      <Panel title="Capital returns" sub="Reinvest profits, pay dividends, or buy back shares">
        <div className="grid g2">
          <Field label="Quarterly dividend per share" hint={`Costs ≈ ${money(div * totalShares(s))} per quarter`}><NumberInput label="Dividend" value={div} onCommit={setDiv} suffix="₹" /></Field>
          <Field label="Monthly buyback budget" hint="Repurchased shares reduce the share count"><NumberInput label="Buyback" value={bb} onCommit={setBb} suffix="₹" /></Field>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button type="button" className="btn sm primary" onClick={() => game.dispatch((x) => cmd.setDividend(x, div))}>Set dividend</button>
          <button type="button" className="btn sm" onClick={() => game.dispatch((x) => cmd.setBuyback(x, bb))}>Set buyback</button>
        </div>
        <p className="faint small" style={{ marginTop: 10 }}>Dividends paid to date: {money(s.finance.dividendsPaid)} · treasury stock {money(s.finance.treasuryStock)}.</p>
      </Panel>
    </div>
  );
}

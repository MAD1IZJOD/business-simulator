import { useState } from 'react';
import { useSim } from '../game/hooks';
import { Badge, Empty, Panel, Tabs } from '../components/ui';
import { formatDay } from '../../engine/calendar';
import { activeModifiers } from '../../engine/context';
import { useUi } from '../shell/nav';

export function News() {
  const s = useSim();
  const ui = useUi();
  const [tab, setTab] = useState<'news' | 'events' | 'alerts' | 'effects'>('news');
  const [cat, setCat] = useState('all');
  const cats = ['all', 'company', 'competitor', 'market', 'macro', 'event', 'industry'];
  const news = s.news.filter((n) => cat === 'all' || n.category === cat);
  const mods = activeModifiers(s);
  return (
    <div>
      <div className="page-head"><div><h1>News & events</h1><p>Everything reported here happened inside the simulation.</p></div></div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'news', label: 'News feed' }, { id: 'events', label: `Event log (${s.events.length})` }, { id: 'alerts', label: `Alert center (${s.alerts.length})` }, { id: 'effects', label: `Active effects (${mods.length})` }]} />
      {tab === 'news' && (
        <Panel actions={<div className="seg" role="group" aria-label="Filter news">{cats.map((c) => <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}</div>} title="Business news">
          <div className="list">
            {news.map((n) => (
              <article key={n.id} className="list-item">
                <span className={`dot ${n.sentiment === 'positive' ? 'good' : n.sentiment === 'negative' ? 'bad' : 'info'}`} aria-hidden="true" />
                <div>
                  <div style={{ fontWeight: 600 }}>{n.headline}</div>
                  {n.body && <div className="small muted">{n.body}</div>}
                  <div className="tiny faint">{formatDay(s, n.day)} · {n.category}</div>
                </div>
              </article>
            ))}
            {!news.length && <Empty>No news in this category.</Empty>}
          </div>
        </Panel>
      )}
      {tab === 'events' && (
        <Panel title="Random events" sub="Each event has a probability that depends on your situation, and concrete consequences.">
          <div className="list">
            {s.events.map((e) => (
              <div key={e.id} className="list-item">
                <span className={`dot ${e.sentiment === 'positive' ? 'good' : e.sentiment === 'negative' ? 'bad' : 'info'}`} aria-hidden="true" />
                <div>
                  <div className="row"><strong>{e.title}</strong><Badge>{e.category}</Badge></div>
                  <div className="small muted">{e.description}</div>
                  {e.effects.length > 0 && <ul className="small" style={{ margin: '4px 0 0', paddingLeft: 18 }}>{e.effects.map((x) => <li key={x}>{x}</li>)}</ul>}
                  <div className="tiny faint">{formatDay(s, e.day)}</div>
                </div>
              </div>
            ))}
            {!s.events.length && <Empty>No events yet.</Empty>}
          </div>
        </Panel>
      )}
      {tab === 'alerts' && (
        <Panel title="Alert center" sub="Refreshed at every month-end">
          <div className="list">
            {s.alerts.map((a) => (
              <div key={a.id} className="list-item">
                <span className={`dot ${a.severity === 'critical' ? 'bad' : a.severity === 'warning' ? 'warn' : a.severity === 'opportunity' ? 'good' : 'info'}`} aria-hidden="true" />
                <div style={{ flex: 1 }}>
                  <div className="row"><strong>{a.title}</strong><Badge tone={a.severity === 'critical' ? 'bad' : a.severity === 'warning' ? 'warn' : a.severity === 'opportunity' ? 'good' : 'info'}>{a.severity}</Badge></div>
                  <div className="small muted">{a.detail}</div>
                </div>
                {a.link && <button type="button" className="btn sm" onClick={() => ui.go(a.link as never)}>Go</button>}
              </div>
            ))}
            {!s.alerts.length && <Empty>No alerts.</Empty>}
          </div>
        </Panel>
      )}
      {tab === 'effects' && (
        <Panel title="What is affecting you right now" sub="Temporary modifiers from events, partnerships and deals">
          <table className="data">
            <thead><tr><th>Source</th><th>Affects</th><th className="num">Effect</th><th>Until</th></tr></thead>
            <tbody>
              {mods.map((m) => <tr key={m.id}><td>{m.source}</td><td>{m.target.replace(/_/g, ' ')}{m.scope ? ` (${m.scope})` : ''}</td><td className={`num ${m.value >= 1 ? '' : ''}`}>{m.value >= 1 ? '+' : '−'}{Math.abs((m.value - 1) * 100).toFixed(0)}%</td><td>{formatDay(s, m.endDay)}</td></tr>)}
            </tbody>
          </table>
          {!mods.length && <Empty>No active effects.</Empty>}
        </Panel>
      )}
    </div>
  );
}

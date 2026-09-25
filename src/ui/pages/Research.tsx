import { useSim } from '../game/hooks';
import { game } from '../game/controller';
import * as cmd from '../../engine/commands';
import { Badge, Bar, Empty, Field, Kpi, NumberInput, Panel } from '../components/ui';
import { money, pct } from '../format';
import { RESEARCH_PROJECTS, TECHNOLOGIES, TECH_IDS } from '../../engine/data/technology';
import { researchCapacity, upgradeCost } from '../../engine/systems/tech';
import { computeRisks } from '../../engine/systems/insights';
import { formatDay } from '../../engine/calendar';
import { industryOf } from '../../engine/context';

export function Research() {
  const s = useSim();
  const risks = computeRisks(s);
  const ind = industryOf(s);
  const up = s.tech.upgrading;
  return (
    <div className="stack">
      <div className="page-head"><div><h1>R&D, technology & risk</h1><p>Research unlocks lasting advantages; technology lifts productivity and cuts costs; security, legal and compliance keep you alive.</p></div></div>
      <div className="grid g4">
        <Kpi label="Research capacity" value={`${researchCapacity(s).toFixed(1)} pts/mo`} hint="From researchers, data scientists, the lab budget and labs." />
        <Kpi label="Vulnerability" value={s.security.vulnerability.toFixed(0)} delta={`${s.security.incidents} incidents so far`} deltaClass={s.security.vulnerability > 50 ? 'bad' : 'muted'} />
        <Kpi label="Regulatory standing" value={s.company.reputation.regulatory.toFixed(0)} delta={`Industry regulation ${pct(ind.regulation, 0)}`} deltaClass={s.company.reputation.regulatory < 30 ? 'bad' : 'muted'} />
        <Kpi label="ESG score" value={s.esg.score.toFixed(0)} delta={`${s.esg.emissions.toFixed(1)} t CO₂ last month`} />
      </div>
      <div className="grid g2">
        <Panel title="Technology" sub={up ? `Upgrading ${TECHNOLOGIES[up.track].name}: done ${formatDay(s, up.doneDay)}` : 'One upgrade at a time. Research capacity shortens implementation.'} flush>
          <table className="data">
            <thead><tr><th>Track</th><th className="num">Level</th><th>Effects</th><th /></tr></thead>
            <tbody>{TECH_IDS.map((t) => (
              <tr key={t}>
                <td><strong>{TECHNOLOGIES[t].name}</strong><div className="tiny faint">{TECHNOLOGIES[t].description}</div></td>
                <td className="num">{s.tech.levels[t]} / 5<Bar value={s.tech.levels[t] / 5} label={`${t} level`} /></td>
                <td className="small muted">{TECHNOLOGIES[t].effects.join('; ')}</td>
                <td className="num"><button type="button" className="btn sm" disabled={Boolean(up) || s.tech.levels[t] >= 5} onClick={() => game.dispatch((st) => cmd.startTechUpgrade(st, t))}>{s.tech.levels[t] >= 5 ? 'Max' : `Upgrade ${money(upgradeCost(s, t))}${s.flags[`techDiscount|${t}`] ? ' (50% off)' : ''}`}</button></td>
              </tr>
            ))}</tbody>
          </table>
        </Panel>
        <Panel title="Research projects" actions={<Field label="Lab budget / month"><NumberInput label="Research budget" value={s.research.budget} onCommit={(v) => game.dispatch((st) => cmd.setResearchBudget(st, v))} suffix="₹" /></Field>}>
          <div className="stack-sm">
            {RESEARCH_PROJECTS.map((p) => {
              const st = s.research.projects[p.id];
              const done = s.research.unlocked.includes(p.id);
              const ready = p.requires.every((r) => s.research.unlocked.includes(r));
              const active = s.research.active === p.id;
              return (
                <div key={p.id} className="panel" style={{ background: 'var(--panel-2)', padding: 12 }}>
                  <div className="row between"><strong>{p.name}</strong>{done ? <Badge tone="good">done</Badge> : active ? <Badge tone="info">active</Badge> : ready ? <button type="button" className="btn sm" onClick={() => game.dispatch((x) => cmd.startResearch(x, p.id))}>Research</button> : <Badge>needs {p.requires.join(', ')}</Badge>}</div>
                  <p className="small muted">{p.description}</p>
                  {!done && <><Bar value={(st?.progress ?? 0) / p.points} label={`${p.name} progress`} /><span className="tiny faint">{(st?.progress ?? 0).toFixed(1)} / {p.points} points{active && researchCapacity(s) > 0 ? ` · ~${Math.ceil((p.points - (st?.progress ?? 0)) / researchCapacity(s))} months` : ''}</span></>}
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
      <div className="grid g3">
        <Panel title="Cybersecurity">
          <Field label="Security program budget / month" hint="Monitoring, audits, tooling"><NumberInput label="Security budget" value={s.security.budget} onCommit={(v) => game.dispatch((st) => cmd.setSecurityBudget(st, v))} suffix="₹" /></Field>
          <p className="small muted" style={{ marginTop: 8 }}>Vulnerability {s.security.vulnerability.toFixed(0)}/100. Breaches cost recovery money, customers, brand and (in regulated industries) fines. Security engineers and Cyber defense tech lower it.</p>
          {s.security.lastIncidentDay !== null && <p className="bad small">Last incident: {formatDay(s, s.security.lastIncidentDay)}</p>}
        </Panel>
        <Panel title="Legal matters">
          {s.legalCases.length === 0 ? <Empty>No legal cases.</Empty> : s.legalCases.map((l) => (
            <div key={l.id} className="list-item" style={{ display: 'block' }}>
              <div className="row between"><strong className="small">{l.title}</strong><Badge tone={l.status === 'won' || l.status === 'settled' ? 'good' : l.status === 'lost' ? 'bad' : 'warn'}>{l.status}{l.fighting && l.status === 'open' ? ' · fighting' : ''}</Badge></div>
              <div className="tiny faint">Exposure {money(l.exposure)} · win odds {pct(l.winProbability, 0)} · {l.status === 'open' ? `resolves ~${formatDay(s, l.resolveDay)}` : ''}</div>
            </div>
          ))}
        </Panel>
        <Panel title="ESG & social impact" sub="Some customers and investors care">
          <Field label="Sustainability / month"><NumberInput label="Sustainability" value={s.esg.sustainabilityBudget} onCommit={(v) => game.dispatch((st) => cmd.setEsgBudgets(st, { sustainability: v, community: st.esg.communityBudget, welfare: st.esg.welfareBudget }))} suffix="₹" /></Field>
          <Field label="Community programs / month"><NumberInput label="Community" value={s.esg.communityBudget} onCommit={(v) => game.dispatch((st) => cmd.setEsgBudgets(st, { sustainability: st.esg.sustainabilityBudget, community: v, welfare: st.esg.welfareBudget }))} suffix="₹" /></Field>
          <Field label="Employee welfare / month"><NumberInput label="Welfare" value={s.esg.welfareBudget} onCommit={(v) => game.dispatch((st) => cmd.setEsgBudgets(st, { sustainability: st.esg.sustainabilityBudget, community: st.esg.communityBudget, welfare: v }))} suffix="₹" /></Field>
        </Panel>
      </div>
      <Panel title="Risk register" sub="0 = low risk, 100 = severe">
        <div className="grid g4">
          {risks.map((r) => (
            <div key={r.id} className="health">
              <div className="row between"><span className="small">{r.label}</span><span className={`score ${r.score > 60 ? 'bad' : r.score > 35 ? 'warn' : 'good'}`}>{r.score.toFixed(0)}</span></div>
              <Bar value={r.score / 100} tone={r.score > 60 ? 'bad' : r.score > 35 ? 'warn' : 'good'} label={r.label} />
              {r.drivers.map((d) => <span key={d} className="tiny faint">{d}</span>)}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

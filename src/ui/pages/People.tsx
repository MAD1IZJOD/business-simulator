import { useMemo, useState } from 'react';
import { useSim } from '../game/hooks';
import { game } from '../game/controller';
import { useUi } from '../shell/nav';
import * as cmd from '../../engine/commands';
import { Badge, Bar, Confirm, Empty, Field, Kpi, Modal, NumberInput, Panel, Seg, Tabs } from '../components/ui';
import { HBars } from '../components/charts';
import { money, num, pct } from '../format';
import { DEPARTMENTS, HIREABLE_ROLES, LEVEL_NAMES, MANAGEMENT_STYLES } from '../../engine/data/roles';
import { marketSalary, averageMorale, payrollMonthly, moraleTerms, companyPerformanceTerm } from '../../engine/systems/employees';
import { candidateRate } from '../../engine/systems/hiring';
import { roleName } from '../../engine/context';
import { formatDay } from '../../engine/calendar';
import { MARKET_BY_ID } from '../../engine/data/markets';
import type { DeptId, Employee, JobOpening, ManagementStyle, RemotePolicy, RoleId } from '../../engine/types';

export function People() {
  const [tab, setTab] = useState<'team' | 'hiring' | 'org' | 'culture'>('team');
  const s = useSim();
  return (
    <div className="stack">
      <div className="page-head"><div><h1>People</h1><p>Individual employees with skill, morale, burnout and loyalty. Hiring takes time; morale drives productivity and attrition.</p></div></div>
      <div className="grid g4">
        <Kpi label="Headcount" value={num(s.employees.length)} delta={`${s.pendingHires.length} starting soon`} />
        <Kpi label="Monthly payroll" value={money(payrollMonthly(s))} hint="Includes employer payroll taxes." />
        <Kpi label="Average morale" value={averageMorale(s).toFixed(0)} />
        <Kpi label="Employer reputation" value={s.company.reputation.employer.toFixed(0)} hint="Drives candidate flow and attrition." />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'team', label: 'Team' }, { id: 'hiring', label: `Hiring (${s.openings.length})` }, { id: 'org', label: 'Departments & budgets' }, { id: 'culture', label: 'Morale, culture & management' }]} />
      {tab === 'team' && <Team />}
      {tab === 'hiring' && <Hiring />}
      {tab === 'org' && <Org />}
      {tab === 'culture' && <Culture />}
    </div>
  );
}

type SortKey = 'name' | 'role' | 'level' | 'salary' | 'skill' | 'morale' | 'burnout' | 'productivity' | 'performance';

function Team() {
  const s = useSim();
  const [sort, setSort] = useState<SortKey>('role');
  const [dept, setDept] = useState<DeptId | 'all'>('all');
  const [confirm, setConfirm] = useState<Employee | null>(null);
  const [layoffOpen, setLayoffOpen] = useState(false);
  const list = useMemo(() => {
    const l = s.employees.filter((e) => dept === 'all' || e.dept === dept);
    return [...l].sort((a, b) => {
      const va = a[sort];
      const vb = b[sort];
      return typeof va === 'string' ? String(va).localeCompare(String(vb)) : (vb as number) - (va as number);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.employees, sort, dept, game.version]);
  const th = (k: SortKey, label: string, n = false) => <th className={n ? 'num' : ''} aria-sort={sort === k ? 'descending' : 'none'}><button type="button" onClick={() => setSort(k)}>{label}{sort === k ? ' ▾' : ''}</button></th>;
  return (
    <Panel title={`Employees (${list.length})`} actions={<><select className="input" aria-label="Filter by department" value={dept} onChange={(e) => setDept(e.target.value as DeptId | 'all')} style={{ width: 180 }}><option value="all">All departments</option>{DEPARTMENTS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select><button type="button" className="btn sm danger" onClick={() => setLayoffOpen(true)}>Layoffs…</button></>} flush>
      <div className="table-wrap" style={{ maxHeight: 560, overflowY: 'auto' }}>
        <table className="data">
          <thead><tr>{th('name', 'Name')}{th('role', 'Role')}{th('level', 'Level', true)}{th('salary', 'Salary', true)}{th('skill', 'Skill', true)}{th('morale', 'Morale', true)}{th('burnout', 'Burnout', true)}{th('productivity', 'Output', true)}{th('performance', 'Perf.', true)}<th>Location</th><th /></tr></thead>
          <tbody>
            {list.slice(0, 400).map((e) => (
              <tr key={e.id}>
                <td><strong>{e.name}</strong>{e.key && <> <Badge tone="info">key</Badge></>}{s.day < e.probationEndDay && e.role !== 'founder' && <> <Badge>probation</Badge></>}</td>
                <td>{roleName(s, e.role)}</td>
                <td className="num">{LEVEL_NAMES[e.level]}</td>
                <td className="num">{e.role === 'founder' ? money(s.company.founderSalary) : money(e.salary)}</td>
                <td className="num">{e.skill.toFixed(0)}</td>
                <td className={`num ${e.morale < 40 ? 'bad' : e.morale > 70 ? 'good' : ''}`}>{e.morale.toFixed(0)}</td>
                <td className={`num ${e.burnout > 60 ? 'bad' : ''}`}>{e.burnout.toFixed(0)}</td>
                <td className="num">{e.productivity.toFixed(2)}</td>
                <td className="num">{e.performance.toFixed(2)}</td>
                <td>{MARKET_BY_ID[e.marketId]?.name}</td>
                <td className="num">{e.role !== 'founder' && <div className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
                  <button type="button" className="btn sm" onClick={() => game.dispatch((st) => cmd.promote(st, e.id))} disabled={e.level >= 5}>Promote</button>
                  <button type="button" className="btn sm" onClick={() => game.dispatch((st) => cmd.giveRaise(st, e.id, 10))}>+10%</button>
                  <button type="button" className="btn sm ghost" onClick={() => setConfirm(e)}>Let go</button>
                </div>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length > 400 && <p className="faint small" style={{ padding: 12 }}>Showing 400 of {list.length}.</p>}
      </div>
      <Confirm open={confirm !== null} onClose={() => setConfirm(null)} danger title={`Let ${confirm?.name} go?`} confirmLabel="Terminate" body={<p className="muted">Severance applies after probation (1 month per year of service). Colleagues' morale will dip slightly.</p>} onConfirm={() => confirm && game.dispatch((st) => cmd.terminate(st, confirm.id))} />
      <LayoffModal open={layoffOpen} onClose={() => setLayoffOpen(false)} />
    </Panel>
  );
}

function LayoffModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useSim();
  const [dept, setDept] = useState<DeptId | 'all'>('all');
  const [count, setCount] = useState(1);
  return (
    <Modal open={open} onClose={onClose} title="Layoffs" sub="The lowest performers are let go. Layoffs cut payroll but hurt morale, loyalty and employer reputation for months."
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn danger" onClick={() => { game.dispatch((st) => cmd.layoff(st, dept === 'all' ? null : dept, count)); onClose(); }}>Lay off {count}</button></>}>
      <div className="grid g2">
        <Field label="Department"><select className="input" value={dept} onChange={(e) => setDept(e.target.value as DeptId | 'all')}><option value="all">Whole company</option>{DEPARTMENTS.filter((d) => d.id !== 'executive').map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
        <Field label="How many people" hint={`${s.employees.length - 1} eligible`}><NumberInput label="Count" value={count} min={1} max={Math.max(1, s.employees.length - 1)} onCommit={setCount} /></Field>
      </div>
    </Modal>
  );
}

function Hiring() {
  const s = useSim();
  const [role, setRole] = useState<RoleId>('engineer');
  const [level, setLevel] = useState(2);
  const [count, setCount] = useState(1);
  const [market, setMarket] = useState(s.config.hqMarket);
  const [auto, setAuto] = useState(true);
  const mkt = marketSalary(s, role, level, market);
  const [offerPct, setOfferPct] = useState(100);
  const markets = s.markets.filter((m) => m.entered || m.entering);
  return (
    <>
      <Panel title="Open a role" sub="Candidates arrive over days to weeks. Paying above market attracts more and better candidates. Recruiters speed hiring and cut agency fees.">
        <div className="grid g4">
          <Field label="Role"><select className="input" value={role} onChange={(e) => setRole(e.target.value as RoleId)}>{HIREABLE_ROLES.map((r) => <option key={r.id} value={r.id}>{roleName(s, r.id)}</option>)}</select></Field>
          <Field label="Level"><Seg label="Level" value={level} onChange={setLevel} options={[1, 2, 3, 4, 5].map((l) => ({ id: l, label: LEVEL_NAMES[l] }))} /></Field>
          <Field label="Openings"><NumberInput label="Openings" value={count} min={1} max={200} onCommit={setCount} /></Field>
          <Field label="Location"><select className="input" value={market} onChange={(e) => setMarket(e.target.value)}>{markets.map((m) => <option key={m.id} value={m.id}>{MARKET_BY_ID[m.id].name}</option>)}</select></Field>
          <Field label={`Salary offer: ${offerPct}% of market`} hint={`Market rate ${money(mkt)}/month → offering ${money((mkt * offerPct) / 100)}`}><input type="range" min={70} max={160} step={5} value={offerPct} onChange={(e) => setOfferPct(Number(e.target.value))} /></Field>
          <Field label="Hiring mode"><label className="row"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto-hire suitable candidates</label></Field>
          <div className="stack-sm span2"><span className="small muted">{HIREABLE_ROLES.find((r) => r.id === role)?.description}</span><button type="button" className="btn primary" onClick={() => game.dispatch((st) => cmd.openJob(st, { role, level, count, salaryOffer: (mkt * offerPct) / 100, marketId: market, autoHire: auto }))}>Open {count} role{count > 1 ? 's' : ''}</button></div>
        </div>
      </Panel>
      {s.openings.length === 0 && <Empty>No open roles.</Empty>}
      {s.openings.map((j) => <OpeningCard key={j.id} j={j} />)}
      {s.pendingHires.length > 0 && (
        <Panel title="Accepted offers — starting soon">
          {s.pendingHires.map((p) => <div key={p.id} className="row between small"><span>{p.candidate.name} · {roleName(s, p.role)} ({LEVEL_NAMES[p.level]})</span><span className="faint">starts {formatDay(s, p.startDay)} · {money(p.salary)}/mo</span></div>)}
        </Panel>
      )}
    </>
  );
}

function OpeningCard({ j }: { j: JobOpening }) {
  const s = useSim();
  const [offers, setOffers] = useState<Record<string, number>>({});
  const cands = j.candidates.filter((c) => c.status === 'new' || c.status === 'offered');
  const rate = candidateRate(s, j);
  return (
    <Panel title={`${roleName(s, j.role)} · ${LEVEL_NAMES[j.level]} · ${j.filled}/${j.count} filled`} sub={`Offering ${money(j.salaryOffer)}/mo in ${MARKET_BY_ID[j.marketId].name} · ~${(rate * 7).toFixed(1)} candidates/week · ${j.autoHire ? 'auto-hiring' : 'manual review'}`}
      actions={<button type="button" className="btn sm ghost" onClick={() => game.dispatch((st) => cmd.closeJob(st, j.id))}>Close role</button>} flush>
      {cands.length === 0 ? <p className="faint small" style={{ padding: '0 16px 14px' }}>Waiting for candidates…</p> : (
        <table className="data">
          <thead><tr><th>Candidate</th><th className="num">Assessed skill</th><th className="num">Experience</th><th className="num">Asking</th><th>Status</th><th>Offer</th><th /></tr></thead>
          <tbody>
            {cands.map((c) => (
              <tr key={c.id}>
                <td>{c.name}<div className="tiny faint">expires {formatDay(s, c.expiresDay)}</div></td>
                <td className="num">{c.perceivedSkill.toFixed(0)} <span className="faint tiny">±{c.uncertainty.toFixed(0)}</span></td>
                <td className="num">{c.experience.toFixed(1)}y</td>
                <td className="num">{money(c.askSalary)}</td>
                <td>{c.status === 'offered' ? <Badge tone="warn">countered {money(c.counterOffer ?? 0)}</Badge> : <Badge>new</Badge>}</td>
                <td><NumberInput label={`Offer to ${c.name}`} value={offers[c.id] ?? c.counterOffer ?? j.salaryOffer} onCommit={(v) => setOffers((o) => ({ ...o, [c.id]: v }))} width={110} /></td>
                <td className="num"><div className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
                  <button type="button" className="btn sm" disabled={c.interviewed} onClick={() => game.dispatch((st) => cmd.interview(st, j.id, c.id))}>{c.interviewed ? 'Interviewed' : 'Interview'}</button>
                  <button type="button" className="btn sm primary" onClick={() => game.dispatch((st) => cmd.makeOffer(st, j.id, c.id, offers[c.id] ?? c.counterOffer ?? j.salaryOffer))}>Offer</button>
                  <button type="button" className="btn sm ghost" onClick={() => game.dispatch((st) => cmd.rejectCandidate(st, j.id, c.id), true)}>Reject</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

function Org() {
  const s = useSim();
  const r = s.reports[s.reports.length - 1];
  return (
    <div className="grid g2">
      <Panel title="Departments" sub="Budgets buy tools and training: +productivity and faster skill growth, with diminishing returns." flush>
        <table className="data">
          <thead><tr><th>Department</th><th className="num">People</th><th className="num">Salary cost (last mo)</th><th>Budget / month</th></tr></thead>
          <tbody>{DEPARTMENTS.map((d) => (
            <tr key={d.id}>
              <td><strong>{d.name}</strong><div className="tiny faint">{d.description}</div></td>
              <td className="num">{s.employees.filter((e) => e.dept === d.id).length}</td>
              <td className="num">{money(r?.breakdown.salaryByDept[d.id] ?? 0)}</td>
              <td><NumberInput label={`${d.name} budget`} value={s.departments[d.id].budget} onCommit={(v) => game.dispatch((st) => cmd.setDeptBudget(st, d.id, v))} width={110} /></td>
            </tr>
          ))}</tbody>
        </table>
      </Panel>
      <Panel title="Headcount by department">
        <HBars unit="count" items={DEPARTMENTS.map((d) => ({ label: d.name, value: s.employees.filter((e) => e.dept === d.id).length })).filter((x) => x.value > 0)} />
        <div className="sep" />
        <Field label="Founder salary" hint="Paying yourself costs runway but protects your own morale (flavour) — it's a real cash cost."><NumberInput label="Founder salary" value={s.company.founderSalary} onCommit={(v) => game.dispatch((st) => cmd.setFounderSalary(st, v))} suffix="₹/mo" /></Field>
      </Panel>
    </div>
  );
}

function Culture() {
  const s = useSim();
  const ui = useUi();
  const sample = s.employees.find((e) => e.role !== 'founder') ?? s.employees[0];
  const terms = sample ? moraleTerms(s, sample, companyPerformanceTerm(s), 0) : null;
  const r = s.reports[s.reports.length - 1];
  const drivers = r?.drivers.morale ?? [];
  return (
    <div className="grid g2">
      <Panel title="Management style" sub="Shapes culture, morale, burnout, marketing, R&D and costs">
        <div className="stack-sm">
          {(Object.keys(MANAGEMENT_STYLES) as ManagementStyle[]).map((m) => (
            <button key={m} type="button" className="choice" aria-pressed={s.company.managementStyle === m} onClick={() => game.dispatch((st) => cmd.setManagementStyle(st, m))}>
              <span className="title">{MANAGEMENT_STYLES[m].name}</span><span className="small muted">{MANAGEMENT_STYLES[m].description}</span>
            </button>
          ))}
        </div>
        <div className="sep" />
        <Field label="Work policy" hint="Remote raises morale and cuts office needs but weakens collaboration.">
          <Seg label="Work policy" value={s.company.remotePolicy} onChange={(v: RemotePolicy) => game.dispatch((st) => cmd.setRemotePolicy(st, v))} options={[{ id: 'office', label: 'Office' }, { id: 'hybrid', label: 'Hybrid' }, { id: 'remote', label: 'Remote' }]} />
        </Field>
      </Panel>
      <div className="stack">
        <Panel title="What drives morale (company average)" actions={<button type="button" className="why" onClick={() => ui.explain('morale')} aria-label="Why did morale change?">?</button>}>
          {(drivers.length ? drivers : Object.entries(terms ?? {}).map(([label, value]) => ({ label, value }))).map((d) => (
            <div key={d.label} className="row between small" style={{ padding: '2px 0' }}><span>{d.label.replace(/_/g, ' ')}</span><span className={`num ${d.value >= 0 ? 'good' : 'bad'}`}>{d.value >= 0 ? '+' : ''}{d.value.toFixed(1)}</span></div>
          ))}
          <p className="faint small" style={{ marginTop: 6 }}>Target morale = 55 + these terms; morale moves 30% of the way each month. Low morale cuts output and raises attrition.</p>
        </Panel>
        <Panel title="Culture" sub="Evolves slowly toward your management style">
          {(Object.entries(s.company.culture) as [string, number][]).map(([k, v]) => (
            <div key={k} className="stack-sm" style={{ gap: 2, marginBottom: 6 }}><div className="row between small"><span>{k.replace(/([A-Z])/g, ' $1').toLowerCase()}</span><span className="num">{v.toFixed(0)}</span></div><Bar value={v / 100} label={k} /></div>
          ))}
          <p className="faint small">Layoffs shock morale by {pct(s.company.layoffShock, 0)} right now.</p>
        </Panel>
      </div>
    </div>
  );
}

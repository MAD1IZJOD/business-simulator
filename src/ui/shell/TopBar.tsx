import { game } from '../game/controller';
import type { AdvanceUnit } from '../game/controller';
import { useSim } from '../game/hooks';
import { currentDate, formatDate, formatDay, quarterOf, nextMonthStart } from '../../engine/calendar';
import { money, months as fmtMonths } from '../format';
import { payrollMonthly } from '../../engine/systems/employees';
import { upcomingLoanPayments } from '../../engine/systems/loans';
import { useUi } from './nav';
import { Tip } from '../components/ui';

const UNITS: { id: AdvanceUnit; label: string; key: string }[] = [
  { id: 'day', label: '+1 day', key: 'D' },
  { id: 'week', label: '+1 week', key: 'W' },
  { id: 'month', label: '+1 month', key: 'M' },
  { id: 'quarter', label: '+1 quarter', key: 'Q' },
  { id: 'year', label: '+1 year', key: 'Y' },
];

export function upcoming(s: ReturnType<typeof useSim>) {
  const monthEnd = nextMonthStart(s) - 1;
  const rent = s.facilities.reduce((a, f) => a + (f.owned ? 0 : f.rent), 0) + s.factories.reduce((a, f) => a + (f.owned ? 0 : f.rent), 0);
  const payables = s.finance.ap.filter((b) => b.dueDay <= s.day + 30).reduce((a, b) => a + b.amount, 0);
  const nextDelivery = s.orders.filter((o) => o.status === 'open').sort((a, b) => a.dueDay - b.dueDay)[0];
  const events: { day: number; label: string }[] = [];
  if (s.raise) events.push({ day: s.raise.closesDay, label: 'Funding round closes' });
  if (s.ipo) events.push({ day: s.ipo.readyDay, label: 'IPO listing' });
  if (s.tech.upgrading) events.push({ day: s.tech.upgrading.doneDay, label: `${s.tech.upgrading.track} upgrade done` });
  for (const m of s.markets) if (m.entering && m.entryCompleteDay !== null) events.push({ day: m.entryCompleteDay, label: `Launch in ${m.id.toUpperCase()}` });
  for (const f of s.factories) if (f.status === 'building') events.push({ day: f.readyDay, label: `${f.name} opens` });
  const nextDecision = s.decisions.filter((d) => !d.resolved).sort((a, b) => a.expiresDay - b.expiresDay)[0];
  if (nextDecision) events.push({ day: nextDecision.expiresDay, label: `Decision deadline: ${nextDecision.title.slice(0, 40)}` });
  events.sort((a, b) => a.day - b.day);
  return {
    monthEnd,
    payroll: payrollMonthly(s),
    rent,
    loans: upcomingLoanPayments(s),
    payables,
    nextDelivery,
    nextEvent: events[0] ?? null,
  };
}

export function TopBar() {
  const s = useSim();
  const ui = useUi();
  const d = currentDate(s);
  const r = s.reports[s.reports.length - 1];
  const up = upcoming(s);
  const speed = game.settings.speed;
  return (
    <header className="topbar">
      <div className="clock" aria-live="polite">
        <span className="date">{formatDate(d)}</span>
        <span className="sub">Q{quarterOf(d.month)} {d.year} · Month {s.reports.length + 1}{game.busy ? ' · simulating…' : ''}</span>
      </div>
      <div className="controls">
        <button type="button" className={`play ${game.running ? 'running' : ''}`} onClick={() => game.toggle()} aria-label={game.running ? 'Pause (Space)' : 'Play (Space)'} title={game.running ? 'Pause (Space)' : 'Play (Space)'} disabled={s.status !== 'running'}>
          {game.running ? '❚❚' : '▶'}
        </button>
        <div className="seg" role="group" aria-label="Simulation speed">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" aria-pressed={speed === n} onClick={() => game.setSpeed(n)} title={`Speed ${n}`}>{'›'.repeat(Math.min(n, 3))}{n > 3 ? n : ''}</button>
          ))}
        </div>
        {UNITS.map((u) => (
          <button key={u.id} type="button" className="btn sm" disabled={s.status !== 'running' || game.busy} onClick={() => game.advance(u.id)} title={`${u.label} (${u.key})`}>{u.label}</button>
        ))}
      </div>
      <div className="topstats">
        <button type="button" className="topstat btn ghost" style={{ alignItems: 'flex-start', padding: '2px 6px' }} onClick={() => ui.explain('cash')}>
          <span className="l">Cash</span><span className={`v ${s.finance.cash < 0 ? 'bad' : ''}`}>{money(s.finance.cash)}</span>
        </button>
        <div className="topstat"><span className="l">Runway</span><span className={`v ${r && r.kpis.runwayMonths < 6 ? 'bad' : ''}`}>{r ? fmtMonths(r.kpis.runwayMonths) : '–'}</span></div>
        <button type="button" className="topstat btn ghost" style={{ alignItems: 'flex-start', padding: '2px 6px' }} onClick={() => ui.explain('revenue')}>
          <span className="l">Revenue (last mo)</span><span className="v">{r ? money(r.kpis.revenue) : '–'}</span>
        </button>
        <button type="button" className="btn sm ghost" onClick={ui.openPalette} title="Command palette (Ctrl+K)"><kbd>Ctrl</kbd><kbd>K</kbd></button>
      </div>
      <div className="upcoming" style={{ width: '100%' }}>
        <Tip text="Payroll accrues daily and is paid on the last day of the month."><span>Payroll due {formatDay(s, up.monthEnd)}: <strong>{money(up.payroll)}</strong></span></Tip>
        {up.rent > 0 && <span>Rent: <strong>{money(up.rent)}</strong>/mo</span>}
        {up.loans > 0 && <span>Loan payments: <strong>{money(up.loans)}</strong></span>}
        {up.payables > 0 && <span>Supplier bills next 30d: <strong>{money(up.payables)}</strong></span>}
        {up.nextDelivery && <span>Next delivery: <strong>{formatDay(s, up.nextDelivery.dueDay)}</strong>{up.nextDelivery.late ? ' (late)' : ''}</span>}
        {up.nextEvent && <span>Next: <strong>{up.nextEvent.label}</strong> · {formatDay(s, up.nextEvent.day)}</span>}
        <span>Economy: <strong>{s.macro.phase}</strong></span>
      </div>
    </header>
  );
}

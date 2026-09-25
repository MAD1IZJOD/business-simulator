import { useEffect, useRef, useState } from 'react';
import { game } from '../game/controller';
import type { SlotInfo } from '../../persistence/storage';
import { readLeaderboard } from '../../persistence/storage';
import { SCENARIOS } from '../../engine/systems/scenarios';
import { money } from '../format';
import { CreateCompany } from './CreateCompany';
import { Modal } from '../components/ui';

export function Welcome() {
  const [mode, setMode] = useState<'home' | 'create'>('home');
  const [scenario, setScenario] = useState<string | null>(null);
  const [slots, setSlots] = useState<SlotInfo[]>([]);
  const [loadOpen, setLoadOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { game.store.list().then(setSlots).catch(() => setSlots([])); }, [loadOpen]);
  const auto = slots.find((x) => x.slot === 'autosave' && x.meta.status === 'running');
  const board = readLeaderboard().sort((a, b) => b.peakValuation - a.peakValuation).slice(0, 5);

  if (mode === 'create') return <CreateCompany scenarioId={scenario} onBack={() => setMode('home')} />;

  const importFile = async (f: File) => {
    try {
      const text = await f.text();
      game.load(game.store.importText(text));
      game.toast('Save imported.', 'good');
    } catch (e) {
      game.toast(`Import failed: ${e instanceof Error ? e.message : e}`, 'bad');
    }
  };

  return (
    <main className="welcome">
      <div className="welcome-card stack" style={{ gap: 28 }}>
        <div>
          <span className="badge info">Business simulation</span>
          <h1 className="hero-title" style={{ marginTop: 14 }}>Build a company.<br />Live with the consequences.</h1>
          <p className="hero-sub">Set prices, hire people, run factories, raise money and fight competitors in a living economy. Every number is simulated — and every change can be explained.</p>
          <div className="row" style={{ marginTop: 22 }}>
            <button type="button" className="btn primary lg" onClick={() => { setScenario(null); setMode('create'); }}>Start a new company</button>
            {auto && <button type="button" className="btn lg" onClick={() => void game.loadFrom('autosave')}>Continue {auto.meta.company} ({auto.meta.dateLabel})</button>}
            <button type="button" className="btn lg" onClick={() => setLoadOpen(true)}>Load game</button>
            <button type="button" className="btn lg ghost" onClick={() => fileRef.current?.click()}>Import save file</button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }} />
          </div>
        </div>

        <section>
          <h4 style={{ marginBottom: 10 }}>Scenarios</h4>
          <div className="choice-grid">
            {SCENARIOS.map((sc) => (
              <button type="button" key={sc.id} className="choice" onClick={() => { setScenario(sc.id); setMode('create'); }}>
                <span className="title">{sc.name}</span>
                <span className="small muted">{sc.tagline}</span>
                <span className="tiny faint">Goal: {sc.objective}{sc.deadlineMonths ? ` in ${sc.deadlineMonths} months` : ''} · Start with {money(sc.startingCapital)}</span>
              </button>
            ))}
          </div>
        </section>

        {board.length > 0 && (
          <section className="panel">
            <h4 style={{ marginBottom: 8 }}>Your best runs</h4>
            <table className="data">
              <thead><tr><th>Company</th><th>Industry</th><th className="num">Months</th><th className="num">Peak revenue/mo</th><th className="num">Peak valuation</th><th>Outcome</th></tr></thead>
              <tbody>{board.map((b) => <tr key={b.runId}><td>{b.company}</td><td>{b.industry}</td><td className="num">{b.months}</td><td className="num">{money(b.peakRevenue)}</td><td className="num">{money(b.peakValuation)}</td><td>{b.outcome}</td></tr>)}</tbody>
            </table>
          </section>
        )}
      </div>

      <Modal open={loadOpen} onClose={() => setLoadOpen(false)} title="Load game">
        {slots.length === 0 ? <p className="muted">No saved games yet.</p> : (
          <table className="data">
            <thead><tr><th>Slot</th><th>Company</th><th>Date</th><th className="num">Cash</th><th /></tr></thead>
            <tbody>
              {slots.map((sl) => (
                <tr key={sl.slot}>
                  <td>{sl.slot}</td><td>{sl.meta.company}</td><td>{sl.meta.dateLabel}</td><td className="num">{money(sl.meta.cash)}</td>
                  <td className="num"><button type="button" className="btn sm primary" disabled={sl.meta.status === 'corrupted'} onClick={() => { setLoadOpen(false); void game.loadFrom(sl.slot); }}>Load</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>
    </main>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useSim } from '../game/hooks';
import { game } from '../game/controller';
import { Badge, Confirm, Empty, Field, Panel, Seg } from '../components/ui';
import { money, pct } from '../format';
import type { SlotInfo } from '../../persistence/storage';
import { readLeaderboard } from '../../persistence/storage';
import { ACHIEVEMENTS } from '../../engine/data/achievements';
import { formatDay } from '../../engine/calendar';

const SLOTS = ['slot 1', 'slot 2', 'slot 3', 'slot 4', 'slot 5'];

export function Settings() {
  const s = useSim();
  const [slots, setSlots] = useState<SlotInfo[]>([]);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = () => { game.store.list().then(setSlots).catch(() => setSlots([])); };
  useEffect(refresh, []);
  const exportSave = () => {
    const text = game.store.exportText(s);
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${s.company.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${formatDay(s, s.day).replace(/ /g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const importFile = async (f: File) => {
    try { game.load(game.store.importText(await f.text())); game.toast('Save imported.', 'good'); } catch (e) { game.toast(`Import failed: ${e instanceof Error ? e.message : e}`, 'bad'); }
  };
  const board = readLeaderboard();
  const best = (k: 'peakRevenue' | 'peakProfit' | 'peakValuation' | 'peakShare' | 'months') => [...board].sort((a, b) => b[k] - a[k])[0];
  const fastest = [...board].filter((b) => b.fastestCroreMonths !== null).sort((a, b) => (a.fastestCroreMonths ?? 0) - (b.fastestCroreMonths ?? 0))[0];
  const st = game.settings;
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Save & settings</h1><p>Games autosave every month-end{st.autosave ? '' : ' (autosave is off)'}. Saves live in this browser; export a file to keep a copy.</p></div></div>
      <div className="grid g2">
        <Panel title="Save slots" actions={<button type="button" className="btn sm" onClick={refresh}>Refresh</button>} flush>
          <table className="data">
            <thead><tr><th>Slot</th><th>Company</th><th>Game date</th><th /></tr></thead>
            <tbody>
              {['autosave', 'quicksave', ...SLOTS].map((slot) => {
                const info = slots.find((x) => x.slot === slot);
                return (
                  <tr key={slot}>
                    <td>{slot}</td>
                    <td>{info ? info.meta.company : <span className="faint">empty</span>}</td>
                    <td>{info?.meta.dateLabel ?? ''}</td>
                    <td className="num"><div className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
                      {slot !== 'autosave' && <button type="button" className="btn sm primary" onClick={async () => { await game.saveTo(slot); refresh(); }}>Save</button>}
                      <button type="button" className="btn sm" disabled={!info} onClick={() => void game.loadFrom(slot)}>Load</button>
                      <button type="button" className="btn sm ghost" disabled={!info} onClick={() => setConfirmDelete(slot)}>Delete</button>
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="row" style={{ padding: 16 }}>
            <button type="button" className="btn" onClick={exportSave}>Export save file</button>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>Import save file</button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }} />
            <button type="button" className="btn danger" onClick={() => setConfirmQuit(true)}>Quit to main menu</button>
          </div>
        </Panel>
        <Panel title="Preferences">
          <div className="stack">
            <Field label="Theme"><Seg label="Theme" value={st.theme} onChange={(v) => game.updateSettings({ theme: v })} options={[{ id: 'dark', label: 'Dark' }, { id: 'light', label: 'Light' }]} /></Field>
            <Field label="Number format"><Seg label="Number format" value={st.numberStyle} onChange={(v) => game.updateSettings({ numberStyle: v })} options={[{ id: 'indian', label: '₹ lakh / crore' }, { id: 'international', label: '₹ K / M / B' }]} /></Field>
            <label className="row"><input type="checkbox" checked={st.autosave} onChange={(e) => game.updateSettings({ autosave: e.target.checked })} /> Autosave every month</label>
            <label className="row"><input type="checkbox" checked={st.pauseOnDecision} onChange={(e) => game.updateSettings({ pauseOnDecision: e.target.checked })} /> Pause when a new decision arrives</label>
            <div className="small muted">Game seed {s.seed} · difficulty {s.config.difficulty} · schema v{s.schemaVersion}</div>
            {s.log.length > 0 && <details><summary className="small">Engine repairs ({s.log.length})</summary><pre className="tiny faint" style={{ whiteSpace: 'pre-wrap' }}>{s.log.slice(-20).join('\n')}</pre></details>}
          </div>
        </Panel>
      </div>
      <Panel title={`Achievements (${Object.keys(s.achievements).length}/${ACHIEVEMENTS.length})`}>
        <div className="choice-grid">
          {ACHIEVEMENTS.map((a) => {
            const got = s.achievements[a.id];
            return <div key={a.id} className="choice" style={{ cursor: 'default', opacity: got !== undefined ? 1 : 0.55 }} aria-label={`${a.name}${got !== undefined ? ', unlocked' : ', locked'}`}><span className="title">{got !== undefined ? '★' : '☆'} {a.name}</span><span className="small muted">{a.description}</span>{got !== undefined && <span className="tiny faint">Unlocked {formatDay(s, got)}</span>}</div>;
          })}
        </div>
      </Panel>
      <Panel title="Local leaderboard" sub="Your runs on this device">
        {board.length === 0 ? <Empty>Finish a month to record this run.</Empty> : (
          <div className="grid g3">
            {[['Highest monthly revenue', best('peakRevenue'), (b: typeof board[0]) => money(b.peakRevenue)], ['Highest monthly profit', best('peakProfit'), (b: typeof board[0]) => money(b.peakProfit)], ['Highest valuation', best('peakValuation'), (b: typeof board[0]) => money(b.peakValuation)], ['Largest market share', best('peakShare'), (b: typeof board[0]) => pct(b.peakShare)], ['Longest survival', best('months'), (b: typeof board[0]) => `${b.months} months`], ['Fastest to ₹1 Cr run-rate', fastest, (b: typeof board[0]) => `${b.fastestCroreMonths} months`]].map(([label, b, f]) => (
              <div key={label as string} className="kpi"><span className="kpi-label">{label as string}</span>{b ? <><span className="kpi-value">{(f as (x: typeof board[0]) => string)(b as typeof board[0])}</span><span className="small muted">{(b as typeof board[0]).company} · {(b as typeof board[0]).industry} <Badge>{(b as typeof board[0]).difficulty}</Badge></span></> : <span className="faint">—</span>}</div>
            ))}
          </div>
        )}
      </Panel>
      <Panel title="Keyboard shortcuts">
        <div className="grid g3 small">
          <span><kbd>Space</kbd> Play / pause</span><span><kbd>D</kbd> <kbd>W</kbd> <kbd>M</kbd> <kbd>Q</kbd> <kbd>Y</kbd> Advance day / week / month / quarter / year</span><span><kbd>Ctrl</kbd>+<kbd>K</kbd> Command palette</span>
          <span><kbd>1</kbd>–<kbd>9</kbd> Jump to pages</span><span><kbd>?</kbd> Learn</span><span><kbd>Esc</kbd> Close dialogs</span>
        </div>
      </Panel>
      <Confirm open={confirmQuit} onClose={() => setConfirmQuit(false)} title="Quit to main menu?" body={<p>Your game autosaves at each month-end. Save to a slot first if you want to keep today's progress.</p>} confirmLabel="Quit" onConfirm={() => game.quit()} />
      <Confirm open={confirmDelete !== null} onClose={() => setConfirmDelete(null)} danger title={`Delete ${confirmDelete}?`} body={<p>This cannot be undone.</p>} confirmLabel="Delete" onConfirm={async () => { if (confirmDelete) { await game.store.remove(confirmDelete); refresh(); } }} />
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { game } from '../game/controller';
import { useGameVersion, useSim } from '../game/hooks';
import { NAV, useUi } from './nav';
import type { PageId } from './nav';
import { Modal } from '../components/ui';
import { money } from '../format';
import type { ExplainMetric } from '../../engine/explain';

export function Sidebar() {
  const s = useSim();
  const ui = useUi();
  const open = s.decisions.filter((d) => !d.resolved).length;
  const critical = s.alerts.filter((a) => a.severity === 'critical').length;
  return (
    <nav className="sidebar" aria-label="Main navigation">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">{s.company.name.slice(0, 1).toUpperCase()}</div>
        <div>
          <div className="brand-name">{s.company.name}</div>
          <div className="brand-sub">{s.config.difficulty} · {s.config.industry}</div>
        </div>
      </div>
      {NAV.map((g) => (
        <div className="nav-group" key={g.group}>
          <div className="nav-group-title">{g.group}</div>
          {g.items.map((it) => (
            <button key={it.id} type="button" className="nav-item" aria-current={ui.page === it.id ? 'page' : undefined} onClick={() => ui.go(it.id)} title={it.key ? `${it.label} (${it.key})` : it.label}>
              <span className="glyph" aria-hidden="true">{it.glyph}</span>
              {it.label}
              {it.id === 'decisions' && open > 0 && <span className="count">{open}</span>}
              {it.id === 'news' && critical > 0 && <span className="count bad" aria-label={`${critical} critical alerts`}>{critical}</span>}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}

export function Toasts() {
  useGameVersion();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {game.toasts.map((t) => <div key={t.id} className={`toast ${t.tone}`}>{t.text}</div>)}
    </div>
  );
}

interface PaletteCmd { id: string; label: string; hint?: string; run: () => void }

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ui = useUi();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const cmds = useMemo<PaletteCmd[]>(() => {
    const out: PaletteCmd[] = [];
    for (const g of NAV) for (const it of g.items) out.push({ id: `go-${it.id}`, label: `Go to ${it.label}`, hint: it.key, run: () => ui.go(it.id as PageId) });
    out.push({ id: 'play', label: 'Play / pause', hint: 'Space', run: () => game.toggle() });
    for (const u of ['day', 'week', 'month', 'quarter', 'year'] as const) out.push({ id: `adv-${u}`, label: `Advance one ${u}`, hint: u[0].toUpperCase(), run: () => game.advance(u) });
    const metrics: [ExplainMetric, string][] = [['revenue', 'revenue'], ['profit', 'profit'], ['cash', 'cash'], ['churn', 'churn'], ['cac', 'CAC'], ['customers', 'customers'], ['morale', 'morale'], ['valuation', 'valuation'], ['brand', 'brand'], ['marketShare', 'market share'], ['grossMargin', 'gross margin'], ['pmf', 'product-market fit']];
    for (const [m, l] of metrics) out.push({ id: `why-${m}`, label: `Why did ${l} change?`, run: () => ui.explain(m) });
    out.push({ id: 'theme', label: 'Toggle light / dark theme', run: () => game.updateSettings({ theme: game.settings.theme === 'dark' ? 'light' : 'dark' }) });
    out.push({ id: 'save', label: 'Quick save', run: () => void game.saveTo('quicksave') });
    return out;
  }, [ui]);
  const filtered = cmds.filter((c) => c.label.toLowerCase().includes(q.toLowerCase()));
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 30); }, [open]);
  const run = (c: PaletteCmd | undefined) => { if (!c) return; onClose(); setQ(''); c.run(); };
  return (
    <Modal open={open} onClose={() => { setQ(''); onClose(); }} title="Command palette" sub="Type to search. Enter to run.">
      <input ref={inputRef} className="input" placeholder="Search commands…" value={q} aria-label="Search commands"
        onChange={(e) => { setQ(e.target.value); setSel(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setSel((x) => Math.min(filtered.length - 1, x + 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setSel((x) => Math.max(0, x - 1)); }
          if (e.key === 'Enter') { e.preventDefault(); run(filtered[sel]); }
        }} />
      <div className="palette-list" role="listbox" aria-label="Commands" style={{ marginTop: 10 }}>
        {filtered.map((c, i) => (
          <button key={c.id} type="button" role="option" aria-selected={i === sel} className="palette-item" onMouseEnter={() => setSel(i)} onClick={() => run(c)}>
            <span>{c.label}</span>{c.hint && <kbd>{c.hint}</kbd>}
          </button>
        ))}
        {!filtered.length && <p className="muted">No matching commands.</p>}
      </div>
    </Modal>
  );
}

export function GameOver() {
  const s = useSim();
  const [dismissed, setDismissed] = useState(false);
  const o = s.outcome;
  if (!o) return null;
  const win = o.kind !== 'failure' && o.kind !== 'ousted';
  return (
    <Modal open={!dismissed} onClose={() => setDismissed(true)} title={o.title} sub={win ? 'Exit complete' : 'The company has closed'}
      footer={<><button type="button" className="btn" onClick={() => setDismissed(true)}>Review the company</button><button type="button" className="btn primary" onClick={() => game.quit()}>Back to main menu</button></>}>
      <div className="stack">
        <p className={win ? 'good' : 'bad'} style={{ fontSize: 16 }}>{o.reason}</p>
        {o.founderProceeds > 0 && <p>Your founder proceeds: <strong>{money(o.founderProceeds)}</strong></p>}
        <h4>{win ? 'Outcome details' : 'Why the company failed'}</h4>
        <ul className="muted">{o.factors.map((f) => <li key={f}>{f}</li>)}</ul>
        <p className="faint small">Months operated: {s.reports.length}. Your run has been recorded on the local leaderboard.</p>
      </div>
    </Modal>
  );
}

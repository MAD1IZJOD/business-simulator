import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { game } from './game/controller';
import { useGameVersion } from './game/hooks';
import { Welcome } from './onboarding/Welcome';
import { Sidebar, Toasts, CommandPalette, GameOver } from './shell/Chrome';
import { TopBar } from './shell/TopBar';
import { ExplainModal } from './shell/ExplainModal';
import { Coach } from './shell/Coach';
import { NAV, UiContext } from './shell/nav';
import type { PageId, UiApi } from './shell/nav';
import type { ExplainMetric } from '../engine/explain';
import { PAGES } from './pages';

export function App() {
  useGameVersion();
  return (
    <>
      {game.state ? <Shell key={game.state.runId} /> : <Welcome />}
      <Toasts />
    </>
  );
}

function Shell() {
  const [page, setPage] = useState<PageId>('dashboard');
  const [metric, setMetric] = useState<ExplainMetric | null>(null);
  const [palette, setPalette] = useState(false);
  const go = useCallback((p: PageId) => setPage(p), []);
  const ui = useMemo<UiApi>(() => ({ page, go, explain: setMetric, openPalette: () => setPalette(true) }), [page, go]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true); return; }
      if (typing || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
      const k = e.key.toLowerCase();
      if (k === ' ') { e.preventDefault(); game.toggle(); return; }
      const units: Record<string, 'day' | 'week' | 'month' | 'quarter' | 'year'> = { d: 'day', w: 'week', m: 'month', q: 'quarter', y: 'year' };
      if (units[k]) { game.advance(units[k]); return; }
      for (const g of NAV) for (const it of g.items) if (it.key === e.key) { setPage(it.id); return; }
      if (k === '?') setPage('learn');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const Page = PAGES[page];
  return (
    <UiContext.Provider value={ui}>
      <div className="app">
        <Sidebar />
        <div className="main">
          <TopBar />
          <main className="content" id="main">
            <PageFrame><Page /></PageFrame>
          </main>
        </div>
      </div>
      <Coach />
      <ExplainModal metric={metric} onClose={() => setMetric(null)} />
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <GameOver />
    </UiContext.Provider>
  );
}

function PageFrame({ children }: { children: ReactNode }) {
  return <div style={{ maxWidth: 1480, margin: '0 auto' }}><Suspense fallback={<p className="muted">Loading…</p>}>{children}</Suspense></div>;
}

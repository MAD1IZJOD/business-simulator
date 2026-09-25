import { useState } from 'react';
import { explain } from '../../engine/explain';
import type { ExplainMetric, Explanation } from '../../engine/explain';
import { useSim } from '../game/hooks';
import { Modal } from '../components/ui';
import { money, num } from '../format';
import { reportLabel } from '../components/charts';

function fmt(v: number, unit: Explanation['unit']): string {
  if (unit === 'inr') return money(v);
  if (unit === 'pct') return `${v.toFixed(2)}%`;
  if (unit === 'points') return v.toFixed(1);
  if (unit === 'mult') return Math.abs(v) >= 1000 ? money(v) : `×${v.toFixed(2)}`;
  return num(v, 1);
}

function fmtImpact(v: number, e: Explanation): string {
  const sign = v >= 0 ? '+' : '−';
  if (e.unit === 'inr') return `${sign}${money(Math.abs(v))}`;
  if (e.unit === 'pct' && e.metric === 'churn') return `${sign}${Math.abs(v).toFixed(1)}% on base rate`;
  if (e.unit === 'pct') return `${sign}${Math.abs(v).toFixed(2)}`;
  if (e.unit === 'mult') return Math.abs(v) >= 1000 ? money(v) : `×${v.toFixed(2)}`;
  if (e.unit === 'points') return `${sign}${Math.abs(v).toFixed(1)}`;
  return `${sign}${num(Math.abs(v), 1)}`;
}

/** Waterfall-style breakdown of what moved a metric. */
export function ExplainView({ e }: { e: Explanation }) {
  const additive = e.unit !== 'mult';
  const max = Math.max(1e-9, ...e.factors.map((f) => Math.abs(f.impact)));
  return (
    <div className="stack">
      <div className="row" style={{ gap: 24 }}>
        {e.from !== null && <div className="stack-sm"><span className="faint small">Previous month</span><span className="num" style={{ fontSize: 20, fontWeight: 700 }}>{fmt(e.from, e.unit)}</span></div>}
        <div className="stack-sm"><span className="faint small">This month</span><span className="num" style={{ fontSize: 20, fontWeight: 700 }}>{fmt(e.to, e.unit)}</span></div>
        {e.from !== null && additive && <div className="stack-sm"><span className="faint small">Change</span><span className={`num ${e.to - e.from >= 0 ? 'good' : 'bad'}`} style={{ fontSize: 20, fontWeight: 700 }}>{fmtImpact(e.to - e.from, { ...e, metric: 'revenue' })}</span></div>}
      </div>
      <div>
        {e.factors.length === 0 && <p className="muted">Not enough activity yet to break this down.</p>}
        {e.factors.map((f) => {
          const w = (Math.abs(f.impact) / max) * 50;
          const pos = f.impact >= 0;
          return (
            <div className="wf-row" key={f.label}>
              <div>
                <div>{f.label}</div>
                {f.detail && <div className="faint tiny">{f.detail}</div>}
              </div>
              {additive ? (
                <div className="wf-track" aria-hidden="true">
                  <div className="wf-mid" />
                  <div className={`wf-bar ${pos ? 'pos' : 'neg'}`} style={pos ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }} />
                </div>
              ) : <div />}
              <div className={`num ${additive ? (pos ? 'good' : 'bad') : ''}`} style={{ textAlign: 'right' }}>{fmtImpact(f.impact, e)}</div>
            </div>
          );
        })}
      </div>
      {e.exact && additive && e.factors.length > 0 && <p className="faint small">These factors add up exactly to the change.</p>}
      {e.notes.length > 0 && (
        <ul className="muted small" style={{ margin: 0, paddingLeft: 18 }}>
          {e.notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}
    </div>
  );
}

export function ExplainModal({ metric, onClose }: { metric: ExplainMetric | null; onClose: () => void }) {
  const s = useSim();
  const [idx, setIdx] = useState<number | null>(null);
  const index = idx ?? s.reports.length - 1;
  const e = metric ? explain(s, metric, index) : null;
  const r = s.reports[index];
  return (
    <Modal open={metric !== null} onClose={() => { setIdx(null); onClose(); }} title={e?.title ?? 'Why did this happen?'} sub={r ? `Month: ${reportLabel(r)}` : 'No completed months yet'} wide
      footer={s.reports.length > 1 && (
        <div className="row">
          <button type="button" className="btn sm" disabled={index <= 0} onClick={() => setIdx(index - 1)}>← Earlier month</button>
          <button type="button" className="btn sm" disabled={index >= s.reports.length - 1} onClick={() => setIdx(index + 1)}>Later month →</button>
        </div>
      )}>
      {e ? <ExplainView e={e} /> : <p className="muted">Advance time to at least one month-end to see explanations. Explanations compare a month with the one before it.</p>}
    </Modal>
  );
}

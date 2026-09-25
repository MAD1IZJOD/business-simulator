import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export function Panel({ title, sub, actions, children, className = '', flush = false }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={`panel ${flush ? 'flush' : ''} ${className}`}>
      {(title || actions) && (
        <div className="panel-head">
          <div>
            {title && <h3>{title}</h3>}
            {sub && <div className="sub">{sub}</div>}
          </div>
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, delta, deltaClass = 'muted', hint, onWhy, hero = false }: { label: string; value: ReactNode; delta?: ReactNode; deltaClass?: string; hint?: string; onWhy?: () => void; hero?: boolean }) {
  return (
    <div className={`kpi ${hero ? 'hero' : ''}`}>
      <div className="kpi-label">
        {label}
        {hint && <Tip text={hint}><span className="faint" aria-label={hint}>ⓘ</span></Tip>}
      </div>
      <div className="kpi-value">{value}</div>
      {delta !== undefined && <div className={`kpi-delta ${deltaClass}`}>{delta}</div>}
      {onWhy && <button type="button" className="why" onClick={onWhy} aria-label={`Why did ${label} change?`} title="Why did this change?">?</button>}
    </div>
  );
}

export function Tip({ text, children }: { text: string; children: ReactNode }) {
  const id = useId();
  return (
    <span className="tip" tabIndex={0} aria-describedby={id}>
      {children}
      <span role="tooltip" id={id} className="tip-bubble">{text}</span>
    </span>
  );
}

export function Badge({ tone = '', children }: { tone?: '' | 'good' | 'bad' | 'warn' | 'info'; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Bar({ value, tone = '', label }: { value: number; tone?: '' | 'good' | 'bad' | 'warn'; label?: string }) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <div className={`bar ${tone}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} aria-label={label}>
      <span style={{ width: `${v * 100}%` }} />
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)} type="button">{t.label}</button>
      ))}
    </div>
  );
}

export function Seg<T extends string | number>({ options, value, onChange, label }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.id)} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

/** Numeric input that commits on blur/Enter, rejecting invalid values. */
export function NumberInput({ value, onCommit, min = 0, max, step = 1, label, suffix, width }: { value: number; onCommit: (v: number) => void; min?: number; max?: number; step?: number; label: string; suffix?: string; width?: number }) {
  const [text, setText] = useState(String(roundForInput(value)));
  const [focused, setFocused] = useState(false);
  const shown = focused ? text : String(roundForInput(value));
  const commit = () => {
    setFocused(false);
    const v = Number(text.replace(/,/g, ''));
    if (Number.isFinite(v) && v >= min && (max === undefined || v <= max)) {
      if (v !== value) onCommit(v);
    } else setText(String(roundForInput(value)));
  };
  return (
    <span className="inline-input">
      <input
        className="input num"
        aria-label={label}
        inputMode="decimal"
        value={shown}
        style={width ? { maxWidth: width } : undefined}
        onFocus={() => { setText(String(roundForInput(value))); setFocused(true); }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        step={step}
      />
      {suffix && <span className="faint small">{suffix}</span>}
    </span>
  );
}

function roundForInput(v: number): number {
  return Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

/** Accessible modal built on <dialog>. Esc/back gestures close it; clicking the backdrop closes it too. */
export function Modal({ open, onClose, title, sub, children, footer, wide = false }: { open: boolean; onClose: () => void; title: ReactNode; sub?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onCloseEvt = () => onClose();
    d.addEventListener('close', onCloseEvt);
    // Light-dismiss fallback for browsers without <dialog closedby>.
    const onClick = (e: MouseEvent) => {
      if ('closedBy' in HTMLDialogElement.prototype) return;
      if (e.target !== d) return;
      const r = d.getBoundingClientRect();
      if (e.clientY < r.top || e.clientY > r.bottom || e.clientX < r.left || e.clientX > r.right) d.close();
    };
    d.addEventListener('click', onClick);
    return () => { d.removeEventListener('close', onCloseEvt); d.removeEventListener('click', onClick); };
  }, [onClose]);
  return (
    <dialog ref={ref} className={`modal ${wide ? 'wide' : ''}`} aria-labelledby={titleId} {...{ closedby: 'any' }}>
      {open && (
        <>
          <div className="modal-head">
            <div>
              <h2 id={titleId}>{title}</h2>
              {sub && <div className="muted small" style={{ marginTop: 4 }}>{sub}</div>}
            </div>
            <button type="button" className="btn ghost sm" onClick={() => ref.current?.close()} aria-label="Close dialog">✕</button>
          </div>
          <div className="modal-body">{children}</div>
          {footer && <div className="modal-foot">{footer}</div>}
        </>
      )}
    </dialog>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="stack-sm">
      <span className="faint small">{label}</span>
      <span style={{ fontWeight: 700, fontSize: 16 }} className="num">{value}</span>
      {sub && <span className="faint tiny">{sub}</span>}
    </div>
  );
}

export function Confirm({ open, title, body, confirmLabel = 'Confirm', danger = false, onConfirm, onClose }: { open: boolean; title: string; body: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={title} footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className={`btn ${danger ? 'danger' : 'primary'}`} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button></>}>
      {body}
    </Modal>
  );
}

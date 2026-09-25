import type { Decision } from '../../engine/types';
import { game } from '../game/controller';
import { decide } from '../../engine/commands';
import { useSim } from '../game/hooks';
import { formatDay } from '../../engine/calendar';
import { Badge } from '../components/ui';

export function DecisionCard({ d, compact = false }: { d: Decision; compact?: boolean }) {
  const s = useSim();
  const daysLeft = d.expiresDay - s.day;
  return (
    <article className={`decision ${d.category}`} aria-label={d.title}>
      <div className="row between">
        <div className="row">
          <Badge tone={d.category === 'crisis' ? 'bad' : d.category === 'opportunity' ? 'good' : 'info'}>{d.category}</Badge>
          <h3>{d.title}</h3>
        </div>
        {!d.resolved && <span className={`small ${daysLeft <= 5 ? 'warn' : 'faint'}`}>{daysLeft} day{daysLeft === 1 ? '' : 's'} left</span>}
      </div>
      {!compact && <p className="muted">{d.description}</p>}
      {d.resolved ? (
        <p className="small"><strong>Chosen:</strong> {d.options.find((o) => o.id === d.chosen)?.label} — <span className="muted">{d.outcome}</span> <span className="faint">({formatDay(s, d.createdDay)})</span></p>
      ) : (
        <div className="options">
          {d.options.map((o) => (
            <button key={o.id} type="button" className="option" onClick={() => game.dispatch((st) => decide(st, d.id, o.id))}>
              <strong>{o.label}{o.id === d.defaultOption && <span className="faint small"> · default</span>}</strong>
              {o.description && <span className="small muted">{o.description}</span>}
              {o.consequences.length > 0 && <ul>{o.consequences.map((c) => <li key={c}>{c}</li>)}</ul>}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

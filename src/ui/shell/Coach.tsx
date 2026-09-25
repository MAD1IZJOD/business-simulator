// Tutorial coach: a short guided tour that teaches the core business concepts
// using the player's own company numbers.
import { useState } from 'react';
import { useSim } from '../game/hooks';
import { useUi } from './nav';
import type { PageId } from './nav';
import { money, pct } from '../format';
import type { SimState } from '../../engine/types';
import { readLocal, writeLocal } from '../../persistence/storage';

interface Step { title: string; body: (s: SimState) => string; page?: PageId }

const STEPS: Step[] = [
  { title: 'Welcome, founder', body: (s) => `You run ${s.company.name} with ${money(s.finance.cash)} in the bank. Time is paused. Every decision you make changes a real simulation — nothing here is random decoration.`, page: 'dashboard' },
  { title: 'Your first decision', body: () => 'Your first product is ready. Open Decisions and choose a launch strategy. A big launch buys awareness but burns cash; a soft launch preserves runway.', page: 'decisions' },
  { title: 'Revenue', body: () => 'Revenue = customers × what each pays. Customers come from marketing (awareness), product appeal (quality, price, brand) and word of mouth. Click the “?” on any KPI to see why it moved.', page: 'dashboard' },
  { title: 'Costs & profit', body: () => 'Costs include cost of sales (making/serving the product) and operating expenses (salaries, marketing, rent). Profit = revenue − all costs. Finance shows the full income statement.', page: 'finance' },
  { title: 'Cash flow ≠ profit', body: () => 'Cash is what keeps you alive. Business customers pay on credit (receivables), inventory ties up cash, payroll is paid at month-end. You can be profitable and still run out of cash.', page: 'finance' },
  { title: 'Margins', body: (s) => `Gross margin = (revenue − cost of sales) ÷ revenue. ${s.config.industry === 'saas' ? 'Software margins are high (~85%).' : 'Physical and service businesses run thinner margins.'} Higher margins fund growth.`, page: 'finance' },
  { title: 'CAC and LTV', body: () => 'CAC = what you spend to win one customer. LTV = the gross profit a customer brings over their lifetime (revenue × margin ÷ churn). Healthy businesses have LTV above 3× CAC.', page: 'growth' },
  { title: 'Market share & competitors', body: (s) => `You compete with ${s.competitors.length} rivals who make their own moves. Market share = your revenue ÷ the market's revenue in places you operate (${pct(s.metrics.marketShare)} today).`, page: 'competitors' },
  { title: 'Valuation', body: () => 'Investors value you on revenue run-rate × an industry multiple, adjusted for growth, margins and market conditions. Raising money dilutes your ownership — see Capital & funding.', page: 'capital' },
  { title: 'Advance time', body: () => 'Press ▶ or use +1 day / week / month. Space toggles play; D/W/M/Q/Y advance; Ctrl+K opens the command palette. The simulation pauses when a decision needs you.', page: 'dashboard' },
];

const KEY = 'bizsim.tutorialStep';

export function Coach() {
  const s = useSim();
  const ui = useUi();
  const [step, setStep] = useState(() => readLocal<Record<string, number>>(KEY, {})[s.runId] ?? 0);
  if (!s.config.tutorial || step >= STEPS.length) return null;
  const st = STEPS[step];
  const set = (n: number) => {
    setStep(n);
    const all = readLocal<Record<string, number>>(KEY, {});
    all[s.runId] = n;
    writeLocal(KEY, all);
    const next = STEPS[n];
    if (next?.page) ui.go(next.page);
  };
  return (
    <aside className="coach" aria-label="Tutorial">
      <div className="row between" style={{ marginBottom: 6 }}>
        <span className="badge info">Tutorial {step + 1}/{STEPS.length}</span>
        <button type="button" className="btn ghost sm" onClick={() => set(STEPS.length)}>Skip tutorial</button>
      </div>
      <h3 style={{ marginBottom: 6 }}>{st.title}</h3>
      <p className="muted">{st.body(s)}</p>
      <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
        {step > 0 && <button type="button" className="btn sm" onClick={() => set(step - 1)}>Back</button>}
        <button type="button" className="btn primary sm" onClick={() => set(step + 1)}>{step === STEPS.length - 1 ? 'Start playing' : 'Next'}</button>
      </div>
    </aside>
  );
}

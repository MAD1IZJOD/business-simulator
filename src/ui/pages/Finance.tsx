import { useState } from 'react';
import { useSim } from '../game/hooks';
import { game } from '../game/controller';
import { useUi } from '../shell/nav';
import * as cmd from '../../engine/commands';
import { Badge, Empty, Field, Kpi, NumberInput, Panel, Seg, Tabs } from '../components/ui';
import { RangePicker, TimeChart, sliceRange, useRange, reportLabel } from '../components/charts';
import { money, months, pct, rupees } from '../format';
import { aggregateReports } from '../../engine/systems/reports';
import { loanOffers, creditSpread } from '../../engine/systems/loans';
import { hqCountry } from '../../engine/context';
import { COUNTRIES, MARKET_BY_ID } from '../../engine/data/markets';
import type { LoanKind, MonthlyReport } from '../../engine/types';

type Period = 'month' | 'quarter' | 'year';

function periods(reports: MonthlyReport[], p: Period): { label: string; report: MonthlyReport }[] {
  if (p === 'month') return reports.map((r) => ({ label: reportLabel(r), report: r }));
  const groups = new Map<string, MonthlyReport[]>();
  for (const r of reports) {
    const key = p === 'quarter' ? `Q${Math.floor((r.month - 1) / 3) + 1} ${r.year}` : `FY ${r.year}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.entries()].map(([label, rs]) => ({ label: rs.length < (p === 'quarter' ? 3 : 12) ? `${label} (partial)` : label, report: aggregateReports(rs)! }));
}

export function Finance() {
  const [tab, setTab] = useState<'statements' | 'economics' | 'debt' | 'tax'>('statements');
  const s = useSim();
  const ui = useUi();
  const r = s.reports[s.reports.length - 1];
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Finance</h1><p>Statements are built from ledger postings; the balance sheet always balances.</p></div></div>
      <div className="grid g4">
        <Kpi label="Cash" value={money(s.finance.cash)} onWhy={() => ui.explain('cash')} />
        <Kpi label="Monthly burn" value={r ? (r.kpis.burn > 0 ? money(r.kpis.burn) : 'Cash-flow positive') : '–'} hint="Operating + investing cash outflow per month." />
        <Kpi label="Runway" value={r ? months(r.kpis.runwayMonths) : '–'} deltaClass={r && r.kpis.runwayMonths < 6 ? 'bad' : 'muted'} delta={r && r.kpis.runwayMonths < 6 ? 'Below 6 months' : ''} />
        <Kpi label="Net income (last month)" value={r ? money(r.kpis.netIncome) : '–'} onWhy={() => ui.explain('profit')} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'statements', label: 'Financial statements' }, { id: 'economics', label: 'Unit economics & trends' }, { id: 'debt', label: 'Loans & credit' }, { id: 'tax', label: 'Taxes & assumptions' }]} />
      {tab === 'statements' && <Statements />}
      {tab === 'economics' && <Economics />}
      {tab === 'debt' && <Debt />}
      {tab === 'tax' && <Tax />}
    </div>
  );
}

function Statements() {
  const s = useSim();
  const [period, setPeriod] = useState<Period>('month');
  const list = periods(s.reports, period);
  const [idx, setIdx] = useState<number | null>(null);
  if (!list.length) return <Empty>Financial statements appear after the first month-end. Advance time.</Empty>;
  const i = Math.min(idx ?? list.length - 1, list.length - 1);
  const cur = list[i].report;
  const prev = i > 0 ? list[i - 1].report : null;
  const inc = cur.income;
  const bs = cur.balance;
  const cf = cur.cashflow;
  const row = (label: string, v: number, p?: number, cls = '') => (
    <tr className={cls}><td>{label}</td><td className="num">{rupees(v)}</td>{prev && <td className="num faint">{p !== undefined ? rupees(p) : ''}</td>}</tr>
  );
  return (
    <>
      <div className="row between">
        <Seg label="Reporting period" value={period} onChange={(v) => { setPeriod(v); setIdx(null); }} options={[{ id: 'month', label: 'Monthly' }, { id: 'quarter', label: 'Quarterly' }, { id: 'year', label: 'Annual' }]} />
        <Field label="Period"><select className="input" value={i} onChange={(e) => setIdx(Number(e.target.value))} style={{ width: 200 }}>{list.map((p, k) => <option key={p.label + k} value={k}>{p.label}</option>)}</select></Field>
      </div>
      <div className="grid g3">
        <Panel title="Income statement" sub={`${list[i].label} · ₹`} flush>
          <table className="data">
            <thead><tr><th /><th className="num">{list[i].label}</th>{prev && <th className="num">{list[i - 1].label}</th>}</tr></thead>
            <tbody>
              {row('Revenue', inc.revenue, prev?.income.revenue)}
              {inc.refunds > 0 && row('Refunds & returns', -inc.refunds, prev ? -prev.income.refunds : undefined, 'sub')}
              {row('Net revenue', inc.netRevenue, prev?.income.netRevenue, 'total')}
              {Object.entries(inc.cogsBreakdown).filter(([, v]) => v !== 0).map(([k, v]) => <tr key={k} className="sub"><td>{k.replace(/_/g, ' ')}</td><td className="num">{rupees(-v)}</td>{prev && <td className="num faint">{rupees(-(prev.income.cogsBreakdown[k as keyof typeof inc.cogsBreakdown] ?? 0))}</td>}</tr>)}
              {row('Cost of sales', -inc.cogs, prev ? -prev.income.cogs : undefined)}
              {row('Gross profit', inc.grossProfit, prev?.income.grossProfit, 'total')}
              {Object.entries(inc.opex).filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => <tr key={k} className="sub"><td>{k.replace(/_/g, ' ')}</td><td className="num">{rupees(-v)}</td>{prev && <td className="num faint">{rupees(-(prev.income.opex[k as keyof typeof inc.opex] ?? 0))}</td>}</tr>)}
              {row('Operating expenses', -inc.totalOpex, prev ? -prev.income.totalOpex : undefined)}
              {row('EBITDA', inc.ebitda, prev?.income.ebitda, 'total')}
              {row('Depreciation', -inc.depreciation, prev ? -prev.income.depreciation : undefined)}
              {row('EBIT', inc.ebit, prev?.income.ebit, 'total')}
              {row('Interest', -inc.interest, prev ? -prev.income.interest : undefined)}
              {inc.otherIncome !== 0 && row('Other income / gains', inc.otherIncome, prev?.income.otherIncome)}
              {row('Earnings before tax', inc.ebt, prev?.income.ebt)}
              {row('Tax', -inc.tax, prev ? -prev.income.tax : undefined)}
              {row('Net income', inc.netIncome, prev?.income.netIncome, 'total')}
            </tbody>
          </table>
        </Panel>
        <Panel title="Balance sheet" sub={`End of ${list[i].label} · ₹`} flush>
          <table className="data">
            <tbody>
              <tr><td colSpan={2}><h4>Assets</h4></td></tr>
              {row('Cash', bs.cash)}{row('Accounts receivable', bs.receivables)}{row('Inventory', bs.inventory)}{row('Property, plant & equipment', bs.ppe)}{bs.goodwill > 0 && row('Goodwill', bs.goodwill)}
              {row('Total assets', bs.totalAssets, undefined, 'total')}
              <tr><td colSpan={2}><h4>Liabilities</h4></td></tr>
              {row('Accounts payable', bs.payables)}{row('Accrued payroll', bs.accrued)}{row('Tax payable', bs.taxPayable)}{bs.deferredRevenue > 0 && row('Deferred revenue', bs.deferredRevenue)}{row('Debt', bs.debt)}{bs.overdraft > 0 && row('Overdraft', bs.overdraft)}
              {row('Total liabilities', bs.totalLiabilities, undefined, 'total')}
              <tr><td colSpan={2}><h4>Equity</h4></td></tr>
              {row('Paid-in capital', bs.paidInCapital)}{row('Retained earnings', bs.retainedEarnings)}{bs.treasuryStock > 0 && row('Treasury stock', -bs.treasuryStock)}
              {row('Total equity', bs.equity, undefined, 'total')}
              {row('Liabilities + equity', bs.totalLiabilities + bs.equity, undefined, 'total')}
            </tbody>
          </table>
          <p className="faint small" style={{ padding: '6px 16px 12px' }}>Check: assets − liabilities − equity = {rupees(bs.totalAssets - bs.totalLiabilities - bs.equity)}</p>
        </Panel>
        <Panel title="Cash-flow statement" sub={`${list[i].label} · direct method · ₹`} flush>
          <table className="data">
            <tbody>
              {row('Opening cash', cf.beginCash, undefined, 'total')}
              {(['operating', 'investing', 'financing'] as const).map((k) => (
                <FragmentRows key={k} title={k} items={cf.items[k]} total={cf[k]} />
              ))}
              {row('Net change in cash', cf.net, undefined, 'total')}
              {row('Closing cash', cf.endCash, undefined, 'total')}
            </tbody>
          </table>
        </Panel>
      </div>
    </>
  );
}

function FragmentRows({ title, items, total }: { title: string; items: Record<string, number>; total: number }) {
  const entries = Object.entries(items).filter(([, v]) => Math.abs(v) > 0.5).sort((a, b) => a[1] - b[1]);
  return (
    <>
      <tr><td colSpan={2}><h4>{title} activities</h4></td></tr>
      {entries.map(([k, v]) => <tr key={k} className="sub"><td>{k}</td><td className="num">{rupees(v)}</td></tr>)}
      <tr className="total"><td>Net cash from {title}</td><td className="num">{rupees(total)}</td></tr>
    </>
  );
}

function Economics() {
  const s = useSim();
  const [range, setRange] = useRange(12);
  const r = s.reports[s.reports.length - 1];
  const reps = sliceRange(s.reports, range);
  if (!r) return <Empty>Advance to month-end to see unit economics.</Empty>;
  const k = r.kpis;
  return (
    <>
      <div className="grid g6">
        <Kpi label="CAC" value={money(k.cac)} />
        <Kpi label="LTV" value={money(k.ltv)} delta={k.cac > 0 ? `LTV/CAC ${(k.ltv / k.cac).toFixed(1)}×` : ''} deltaClass={k.cac > 0 && k.ltv / k.cac >= 3 ? 'good' : 'warn'} />
        <Kpi label="ARPU / month" value={money(k.arpu)} />
        <Kpi label="Gross margin" value={pct(k.grossMargin)} />
        <Kpi label="Contribution margin" value={pct(k.contributionMargin)} hint="(Gross profit − marketing) ÷ revenue." />
        <Kpi label="Payback" value={k.paybackMonths > 0 ? `${k.paybackMonths.toFixed(1)} mo` : '–'} />
      </div>
      <div className="grid g2">
        <Panel title="Margins" actions={<RangePicker value={range} onChange={setRange} />}>
          <TimeChart reports={reps} unit="pct" zeroLine series={[{ key: 'gm', label: 'Gross margin', get: (x) => x.kpis.grossMargin }, { key: 'em', label: 'EBITDA margin', get: (x) => (x.kpis.revenue > 0 ? x.kpis.ebitda / x.kpis.revenue : 0) }]} />
        </Panel>
        <Panel title="Cash flows" actions={<RangePicker value={range} onChange={setRange} />}>
          <TimeChart reports={reps} unit="money" type="bar" zeroLine series={[{ key: 'o', label: 'Operating', get: (x) => x.cashflow.operating }, { key: 'i', label: 'Investing', get: (x) => x.cashflow.investing }, { key: 'f', label: 'Financing', get: (x) => x.cashflow.financing }]} />
        </Panel>
        <Panel title="Working capital" actions={<RangePicker value={range} onChange={setRange} />}>
          <TimeChart reports={reps} unit="money" series={[{ key: 'ar', label: 'Receivables', get: (x) => x.balance.receivables }, { key: 'inv', label: 'Inventory', get: (x) => x.balance.inventory }, { key: 'ap', label: 'Payables', get: (x) => x.balance.payables }]} />
          <p className="faint small">Revenue does not arrive as cash immediately: business customers pay on 30–90 day terms, and suppliers let you pay later.</p>
        </Panel>
        <Panel title="Costs by type" actions={<RangePicker value={range} onChange={setRange} />}>
          <TimeChart reports={reps} unit="money" type="bar" stacked series={[{ key: 'c', label: 'Cost of sales', get: (x) => x.income.cogs }, { key: 's', label: 'Salaries', get: (x) => x.income.opex.salaries }, { key: 'm', label: 'Marketing', get: (x) => x.income.opex.marketing }, { key: 'o', label: 'Other opex', get: (x) => x.income.totalOpex - x.income.opex.salaries - x.income.opex.marketing }]} />
        </Panel>
      </div>
    </>
  );
}

function Debt() {
  const s = useSim();
  const offers = loanOffers(s);
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const active = s.loans.filter((l) => l.status !== 'repaid');
  return (
    <>
      <Panel title="Credit offers" sub={`Your credit spread: ${creditSpread(s).toFixed(1)}% over the ${s.macro.interestRate.toFixed(2)}% policy rate`} flush>
        <table className="data">
          <thead><tr><th>Facility</th><th className="num">Rate</th><th className="num">Term</th><th className="num">Available</th><th>Covenants</th><th>Amount</th><th /></tr></thead>
          <tbody>{offers.map((o) => (
            <tr key={o.kind}>
              <td><strong>{o.name}</strong><div className="tiny faint">{o.lender} · {o.reason}</div></td>
              <td className="num">{o.rate.toFixed(1)}%</td>
              <td className="num">{o.termMonths} mo</td>
              <td className="num">{o.available ? money(o.maxAmount) : '—'}</td>
              <td className="small">{o.covenants.length ? o.covenants.map((c) => c.kind.replace('_', ' ')).join(', ') : 'None'}</td>
              <td><NumberInput label={`${o.name} amount`} value={amounts[o.kind] ?? Math.round(o.maxAmount / 2)} onCommit={(v) => setAmounts((a) => ({ ...a, [o.kind]: v }))} width={120} /></td>
              <td className="num"><button type="button" className="btn sm primary" disabled={!o.available} onClick={() => game.dispatch((st) => cmd.takeLoan(st, o.kind as LoanKind, amounts[o.kind] ?? Math.round(o.maxAmount / 2)))}>Borrow</button></td>
            </tr>
          ))}</tbody>
        </table>
      </Panel>
      <Panel title="Your debt" flush>
        {active.length === 0 ? <div style={{ padding: 16 }}><Empty>No outstanding loans.</Empty></div> : (
          <table className="data">
            <thead><tr><th>Loan</th><th>Status</th><th className="num">Balance</th><th className="num">Rate</th><th className="num">Payment</th><th className="num">Months left</th><th>Covenants</th><th /></tr></thead>
            <tbody>{active.map((l) => (
              <tr key={l.id}>
                <td><strong>{l.lender}</strong><div className="tiny faint">{l.kind.replace('_', ' ')} · original {money(l.principal)}</div></td>
                <td><Badge tone={l.status === 'defaulted' ? 'bad' : l.missedPayments ? 'warn' : 'good'}>{l.status}{l.missedPayments ? ` · ${l.missedPayments} missed` : ''}</Badge></td>
                <td className="num">{money(l.balance)}</td>
                <td className="num">{l.rate.toFixed(1)}%</td>
                <td className="num">{l.kind === 'revolver' ? 'interest only' : money(l.monthlyPayment)}</td>
                <td className="num">{l.monthsRemaining}</td>
                <td className="small">{l.covenants.map((c) => <span key={c.kind} className={c.breached ? 'bad' : ''}>{c.kind.replace('_', ' ')} {c.kind === 'min_cash' ? money(c.threshold) : `${c.threshold}×`}{c.breached ? ' (breached)' : ''}; </span>)}</td>
                <td className="num"><button type="button" className="btn sm" onClick={() => game.dispatch((st) => cmd.repayLoan(st, l.id, l.balance))}>Repay all</button></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Panel>
    </>
  );
}

function Tax() {
  const s = useSim();
  const hq = hqCountry(s);
  return (
    <div className="grid g2">
      <Panel title="Tax assumptions (simplified)">
        <ul className="muted" style={{ margin: 0, paddingLeft: 18 }}>
          <li>Corporate tax: <strong>{hq.corporateTax}%</strong> of monthly pre-tax profit in {hq.name} (HQ). {hq.taxNote}</li>
          <li>Losses carry forward and offset future profits. Current carryforward: <strong>{money(s.finance.taxLossCarryforward)}</strong>.</li>
          <li>Tax accrues monthly and is paid quarterly. Payable now: <strong>{money(s.finance.taxPayable)}</strong>.</li>
          <li>Profits earned abroad are taxed at the HQ rate (transfer pricing is not modelled).</li>
          <li>Indirect taxes (GST/VAT) are excluded: prices and revenue are net of them.</li>
          <li>Employer payroll taxes are added to salaries by employee location.</li>
        </ul>
      </Panel>
      <Panel title="Payroll tax by country" flush>
        <table className="data">
          <thead><tr><th>Country</th><th className="num">Corporate</th><th className="num">Employer payroll</th></tr></thead>
          <tbody>{Object.values(COUNTRIES).filter((c) => s.markets.some((m) => (m.entered || m.id === s.config.hqMarket) && MARKET_BY_ID[m.id].country === c.code)).map((c) => <tr key={c.code}><td>{c.name}</td><td className="num">{c.corporateTax}%</td><td className="num">{c.payrollTax}%</td></tr>)}</tbody>
        </table>
      </Panel>
    </div>
  );
}

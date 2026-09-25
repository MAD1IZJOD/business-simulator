import { useSim } from '../game/hooks';
import { game } from '../game/controller';
import * as cmd from '../../engine/commands';
import { Badge, Kpi, NumberInput, Panel } from '../components/ui';
import { RangePicker, TimeChart, sliceRange, useRange } from '../components/charts';
import { money, num, pct } from '../format';
import { COUNTRIES, MARKETS } from '../../engine/data/markets';
import { entryCost, entryDays } from '../../engine/systems/expansion';
import { segmentPotential } from '../../engine/systems/market';
import { segmentsFor, industryOf } from '../../engine/context';
import { suggestedPriceMult } from '../../engine/systems/pricing';
import { formatDay } from '../../engine/calendar';

export function Markets() {
  const s = useSim();
  const [range, setRange] = useRange(24);
  const m = s.macro;
  const r = s.reports[s.reports.length - 1];
  const reps = sliceRange(s.reports, range);
  const segs = segmentsFor(s);
  const ind = industryOf(s);
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Markets & economy</h1><p>The economy moves through expansions, booms, slowdowns and recessions. {ind.name} is {ind.cyclicality < 0 ? 'counter-cyclical — downturns can help' : ind.cyclicality > 1 ? 'highly cyclical' : 'moderately cyclical'}.</p></div><Badge tone={m.phase === 'recession' ? 'bad' : m.phase === 'boom' ? 'good' : 'info'}>{m.phase}{m.recessionKind ? ` (${m.recessionKind})` : ''}</Badge></div>
      <div className="grid g6">
        <Kpi label="GDP growth" value={`${m.gdpGrowth.toFixed(1)}%`} />
        <Kpi label="Inflation" value={`${m.inflation.toFixed(1)}%`} delta={`Price level ×${m.priceLevel.toFixed(3)}`} />
        <Kpi label="Policy rate" value={`${m.interestRate.toFixed(2)}%`} />
        <Kpi label="Unemployment" value={`${m.unemployment.toFixed(1)}%`} hint="Low unemployment makes hiring slower and pricier." />
        <Kpi label="Consumer confidence" value={m.consumerConfidence.toFixed(0)} />
        <Kpi label="Business confidence" value={m.businessConfidence.toFixed(0)} />
      </div>
      <div className="grid g2">
        <Panel title="Economic indicators" actions={<RangePicker value={range} onChange={setRange} />}>
          <TimeChart reports={reps} unit="raw" series={[{ key: 'cc', label: 'Consumer confidence', get: (x) => x.macro.consumerConfidence }, { key: 'bc', label: 'Business confidence', get: (x) => x.macro.businessConfidence }]} height="sm" />
          <TimeChart reports={reps} unit="raw" series={[{ key: 'g', label: 'GDP growth %', get: (x) => x.macro.gdpGrowth }, { key: 'i', label: 'Inflation %', get: (x) => x.macro.inflation }, { key: 'r', label: 'Rate %', get: (x) => x.macro.interestRate }]} height="sm" />
        </Panel>
        <Panel title="Exchange rates & markets" sub="INR per unit. Foreign revenue and costs convert at the current rate.">
          <table className="data">
            <thead><tr><th>Currency</th><th className="num">Now</th><th className="num">Start</th><th className="num">Change</th></tr></thead>
            <tbody>{Object.keys(m.fx).filter((c) => c !== 'INR').map((c) => <tr key={c}><td>{c}</td><td className="num">{m.fx[c] < 1 ? m.fx[c].toFixed(4) : m.fx[c].toFixed(2)}</td><td className="num">{m.fxBase[c] < 1 ? m.fxBase[c].toFixed(4) : m.fxBase[c].toFixed(2)}</td><td className="num">{pct(m.fx[c] / m.fxBase[c] - 1)}</td></tr>)}</tbody>
          </table>
          <p className="faint small" style={{ marginTop: 8 }}>Stock market index {m.marketIndex.toFixed(0)} · funding climate ×{m.fundingClimate.toFixed(2)} · {m.recessionsSurvived} recessions survived.</p>
        </Panel>
      </div>
      <Panel title="Geographic markets" sub="Entering a market takes time and money. Each has its own population, spending power, labour cost, taxes, regulation and competition." flush>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Market</th><th>Status</th><th className="num">Population</th><th className="num">Income idx</th><th className="num">Potential customers</th><th className="num">Our customers</th><th className="num">Revenue (last mo)</th><th className="num">Labour cost</th><th className="num">Tax</th><th className="num">Regulation</th><th className="num">Competition</th><th>Local price ×</th><th /></tr></thead>
            <tbody>
              {MARKETS.map((d) => {
                const ms = s.markets.find((x) => x.id === d.id)!;
                const pot = segs.reduce((a, sg) => a + segmentPotential(s, d.id, sg), 0);
                const c = COUNTRIES[d.country];
                return (
                  <tr key={d.id}>
                    <td><strong>{d.name}</strong><div className="tiny faint">{d.kind} · {c.currency}{d.id === s.config.hqMarket ? ' · HQ' : ''}</div></td>
                    <td>{ms.entered ? <Badge tone="good">operating</Badge> : ms.entering ? <Badge tone="info">live {formatDay(s, ms.entryCompleteDay ?? 0)}</Badge> : <Badge>not entered</Badge>}</td>
                    <td className="num">{num(d.population)}M</td>
                    <td className="num">{d.income.toFixed(1)}</td>
                    <td className="num">{num(pot)}</td>
                    <td className="num">{num(r?.breakdown.customersByMarket[d.id] ?? 0)}</td>
                    <td className="num">{money(r?.breakdown.revenueByMarket[d.id] ?? 0)}</td>
                    <td className="num">{d.laborCost.toFixed(1)}×</td>
                    <td className="num">{c.corporateTax}%</td>
                    <td className="num">{pct(d.regulation, 0)}</td>
                    <td className="num">{pct(d.competition, 0)}</td>
                    <td>{(ms.entered || ms.entering) ? <NumberInput label={`${d.name} price multiplier`} value={ms.priceMult} min={0.1} max={10} onCommit={(v) => game.dispatch((st) => cmd.setMarketPriceMult(st, d.id, v))} width={70} /> : <span className="faint small">PPP {suggestedPriceMult(s, d.id).toFixed(2)}×</span>}</td>
                    <td className="num">
                      {!ms.entered && !ms.entering && <button type="button" className="btn sm primary" onClick={() => game.dispatch((st) => cmd.enterMarket(st, d.id))}>Enter ({money(entryCost(s, d.id))}, {entryDays(s, d.id)}d)</button>}
                      {ms.entered && d.id !== s.config.hqMarket && <button type="button" className="btn sm ghost" onClick={() => game.dispatch((st) => cmd.exitMarket(st, d.id))}>Exit</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

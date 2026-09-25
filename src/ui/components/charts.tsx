// Chart wrappers over Recharts. All series come from simulation reports.
import { useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts';
import type { MonthlyReport } from '../../engine/types';
import { money, num, pct } from '../format';
import { Seg } from './ui';

export const CHART_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)'];

export type Unit = 'money' | 'pct' | 'count' | 'raw';

export function fmtUnit(v: number, unit: Unit): string {
  if (unit === 'money') return money(v);
  if (unit === 'pct') return pct(v);
  if (unit === 'count') return num(v, 0);
  return num(v, 2);
}

export interface SeriesDef {
  key: string;
  label: string;
  get: (r: MonthlyReport) => number;
  color?: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const reportLabel = (r: MonthlyReport) => `${MONTHS[r.month - 1]} ${String(r.year).slice(2)}`;

export type Range = 6 | 12 | 24 | 0;

export function RangePicker({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return <Seg label="Time range" value={value} onChange={onChange} options={[{ id: 6, label: '6M' }, { id: 12, label: '1Y' }, { id: 24, label: '2Y' }, { id: 0, label: 'All' }]} />;
}

export function useRange(initial: Range = 12) {
  return useState<Range>(initial);
}

export function sliceRange<T>(arr: T[], r: Range): T[] {
  return r === 0 ? arr : arr.slice(-r);
}

const axisStyle = { stroke: 'var(--line-2)', fontSize: 11 };

export function TimeChart({ reports, series, unit, type = 'line', height = 'normal', stacked = false, zeroLine = false }: { reports: MonthlyReport[]; series: SeriesDef[]; unit: Unit; type?: 'line' | 'area' | 'bar'; height?: 'sm' | 'normal' | 'lg'; stacked?: boolean; zeroLine?: boolean }) {
  if (!reports.length) return <div className={`chart-box ${height === 'sm' ? 'sm' : height === 'lg' ? 'lg' : ''} empty`} style={{ display: 'grid', placeItems: 'center' }}>No history yet — advance time to see this chart.</div>;
  const data = reports.map((r) => {
    const row: Record<string, number | string> = { label: reportLabel(r) };
    for (const s of series) row[s.key] = s.get(r);
    return row;
  });
  const common = (
    <>
      <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey="label" tick={{ fill: 'var(--text-3)', fontSize: 11 }} axisLine={axisStyle} tickLine={false} minTickGap={16} />
      <YAxis tick={{ fill: 'var(--text-3)', fontSize: 11 }} axisLine={false} tickLine={false} width={64} tickFormatter={(v: number) => fmtUnit(v, unit)} />
      <Tooltip formatter={(v) => fmtUnit(Number(v), unit)} contentStyle={{ background: 'var(--panel-2)', border: '1px solid var(--line-2)', borderRadius: 8 }} labelStyle={{ color: 'var(--text)' }} />
      {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
      {zeroLine && <ReferenceLine y={0} stroke="var(--line-2)" />}
    </>
  );
  const cls = `chart-box ${height === 'sm' ? 'sm' : height === 'lg' ? 'lg' : ''}`;
  return (
    <div className={cls} role="img" aria-label={`Chart of ${series.map((s) => s.label).join(', ')}`}>
      <ResponsiveContainer width="100%" height="100%">
        {type === 'bar' ? (
          <BarChart data={data}>
            {common}
            {series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color ?? CHART_COLORS[i % CHART_COLORS.length]} stackId={stacked ? 'a' : undefined} radius={stacked ? 0 : [3, 3, 0, 0]} isAnimationActive={false} />)}
          </BarChart>
        ) : type === 'area' ? (
          <AreaChart data={data}>
            {common}
            {series.map((s, i) => <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color ?? CHART_COLORS[i % CHART_COLORS.length]} fill={s.color ?? CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.15} stackId={stacked ? 'a' : undefined} isAnimationActive={false} strokeWidth={2} />)}
          </AreaChart>
        ) : (
          <LineChart data={data}>
            {common}
            {series.map((s, i) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color ?? CHART_COLORS[i % CHART_COLORS.length]} dot={false} strokeWidth={2} isAnimationActive={false} />)}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

/** Actual history followed by a forecast band (P10–P90) and median. */
export function ForecastChart({ actual, forecast, unit, label }: { actual: { label: string; value: number }[]; forecast: { label: string; p10: number; p50: number; p90: number }[]; unit: Unit; label: string }) {
  const data: Record<string, number | string | null>[] = actual.map((a) => ({ label: a.label, actual: a.value, median: null, band: null }));
  if (actual.length && forecast.length) data[data.length - 1].median = actual[actual.length - 1].value;
  for (const f of forecast) data.push({ label: f.label, actual: null, median: f.p50, low: f.p10, range: f.p90 - f.p10 });
  return (
    <div className="chart-box lg" role="img" aria-label={`${label}: actual history and forecast range`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: 'var(--text-3)', fontSize: 11 }} axisLine={axisStyle} tickLine={false} minTickGap={16} />
          <YAxis tick={{ fill: 'var(--text-3)', fontSize: 11 }} axisLine={false} tickLine={false} width={64} tickFormatter={(v: number) => fmtUnit(v, unit)} />
          <Tooltip formatter={(v, n) => [fmtUnit(Number(v), unit), String(n)]} contentStyle={{ background: 'var(--panel-2)', border: '1px solid var(--line-2)', borderRadius: 8 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area dataKey="low" stackId="band" stroke="none" fill="transparent" name="Forecast low (P10)" legendType="none" isAnimationActive={false} />
          <Area dataKey="range" stackId="band" stroke="none" fill="var(--chart-1)" fillOpacity={0.15} name="Forecast range (P10–P90)" isAnimationActive={false} />
          <Area dataKey="actual" stroke="var(--chart-2)" strokeWidth={2} fill="none" name="Actual" isAnimationActive={false} connectNulls={false} />
          <Area dataKey="median" stroke="var(--chart-1)" strokeDasharray="5 4" strokeWidth={2} fill="none" name="Forecast (median)" isAnimationActive={false} connectNulls />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HBars({ items, unit }: { items: { label: string; value: number }[]; unit: Unit }) {
  const max = Math.max(1e-9, ...items.map((i) => Math.abs(i.value)));
  return (
    <div className="stack-sm">
      {items.map((i) => (
        <div key={i.label} className="stack-sm" style={{ gap: 3 }}>
          <div className="row between small"><span>{i.label}</span><span className="num muted">{fmtUnit(i.value, unit)}</span></div>
          <div className="bar"><span style={{ width: `${(Math.abs(i.value) / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

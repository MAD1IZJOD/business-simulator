// Display formatting. Money is stored in INR; the user can choose Indian
// (lakh/crore) or international (K/M/B) notation.
export type NumberStyle = 'indian' | 'international';

let style: NumberStyle = 'indian';

export function setNumberStyle(s: NumberStyle): void {
  style = s;
}

export function money(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '–';
  const neg = v < 0;
  const a = Math.abs(v);
  let out: string;
  if (style === 'indian') {
    if (a >= 1e7) out = `₹${(a / 1e7).toFixed(a >= 1e9 ? 0 : digits + 1)} Cr`;
    else if (a >= 1e5) out = `₹${(a / 1e5).toFixed(digits)} L`;
    else if (a >= 1e3) out = `₹${(a / 1e3).toFixed(digits)}k`;
    else out = `₹${a.toFixed(a < 10 && a > 0 ? 2 : 0)}`;
  } else {
    if (a >= 1e9) out = `₹${(a / 1e9).toFixed(digits + 1)}B`;
    else if (a >= 1e6) out = `₹${(a / 1e6).toFixed(digits + 1)}M`;
    else if (a >= 1e3) out = `₹${(a / 1e3).toFixed(digits)}K`;
    else out = `₹${a.toFixed(a < 10 && a > 0 ? 2 : 0)}`;
  }
  return neg ? `−${out}` : out;
}

/** Full-precision rupees for statements. */
export function rupees(v: number): string {
  if (!Number.isFinite(v)) return '–';
  const s = Math.round(Math.abs(v)).toLocaleString(style === 'indian' ? 'en-IN' : 'en-US');
  return v < 0 ? `(${s})` : s;
}

export function num(v: number, digits = 0): string {
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '–';
  const a = Math.abs(v);
  if (a >= 1e7 && style === 'indian') return `${(v / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5 && style === 'indian') return `${(v / 1e5).toFixed(2)} L`;
  if (a >= 1e6 && style === 'international') return `${(v / 1e6).toFixed(2)}M`;
  return v.toLocaleString(style === 'indian' ? 'en-IN' : 'en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function pct(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return '–';
  return `${(v * 100).toFixed(digits)}%`;
}

export function signedPct(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return '–';
  return `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(digits)}%`;
}

export function signedMoney(v: number): string {
  return `${v >= 0 ? '+' : ''}${money(v)}`;
}

export function months(v: number): string {
  if (!Number.isFinite(v)) return '∞';
  return `${v.toFixed(1)} mo`;
}

export function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function deltaClass(v: number, higherIsBetter = true): string {
  if (Math.abs(v) < 1e-9) return 'muted';
  return (v > 0) === higherIsBetter ? 'good' : 'bad';
}

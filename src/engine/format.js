// engine/format.js — display formatting. IDR only for v1 (multi-currency deferred §10).

const grpFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }); // 1,000,000
const numFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }); // qty, up to 2 dp

export function idr(n) {
  if (n == null || isNaN(n)) return '—';
  return (n < 0 ? '-' : '') + 'Rp ' + grpFmt.format(Math.abs(n)); // "Rp 1,000,000" / "-Rp 4,320,000"
}

// Compact IDR for big KPI numerals: "Rp 1,2 mly" / "Rp 340 jt".
export function idrShort(n) {
  if (n == null || isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `Rp ${numFmt.format(n / 1e9)} mly`;
  if (abs >= 1e6) return `Rp ${Math.round(n / 1e6)} jt`;
  if (abs >= 1e3) return `Rp ${Math.round(n / 1e3)} rb`;
  return idr(n);
}

export function num(n) {
  if (n == null || isNaN(n)) return '—';
  return numFmt.format(n);
}

export function fmtDate(d) {
  if (!d) return '—';
  // Plain 'YYYY-MM-DD' must be built from local components — new Date(str) parses it as
  // UTC midnight, which prints the PREVIOUS day in UTC-negative timezones. Full ISO
  // timestamps are real instants and parse correctly.
  const m = typeof d === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  const date = m ? new Date(+m[1], +m[2] - 1, +m[3]) : (typeof d === 'string' ? new Date(d) : d);
  if (isNaN(date)) return '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Local calendar date as YYYY-MM-DD. Uses local components, NOT toISOString(), which
// converts to UTC and rolls back a day for east-of-UTC timezones (e.g. a local-midnight
// date printing as the previous day) — the source of the off-by-one on date pickers/stamps.
export function isoDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function today() {
  return isoDate();
}

export function nowISO() {
  return new Date().toISOString();
}

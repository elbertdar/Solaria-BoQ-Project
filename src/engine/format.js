// engine/format.js — display formatting. IDR only for v1 (multi-currency deferred §10).

const idrFmt = new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
});
const numFmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });

export function idr(n) {
  if (n == null || isNaN(n)) return '—';
  return idrFmt.format(n);
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
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date)) return '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function nowISO() {
  return new Date().toISOString();
}

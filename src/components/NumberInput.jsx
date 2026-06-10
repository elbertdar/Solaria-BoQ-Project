import { useState, useEffect } from 'react';

// A text input that shows thousands separators (1,000,000) while typing, and reports a clean
// numeric value (Number, or '' when empty) back to the parent — so the data model stays numeric.
// type="number" can't render commas, hence type="text" + inputMode for the right mobile keypad.

const stripGroup = (s) => String(s).replace(/,/g, '');
const groupInt = (digits) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function formatTyping(raw, allowDecimal) {
  let s = stripGroup(raw);
  if (allowDecimal) {
    s = s.replace(/[^\d.]/g, '');
    const i = s.indexOf('.');
    if (i === -1) return s ? groupInt(s) : '';
    const intp = s.slice(0, i).replace(/\D/g, '');
    const dec = s.slice(i + 1).replace(/\D/g, '').slice(0, 2); // cap at 2 dp
    return (intp ? groupInt(intp) : '0') + '.' + dec;
  }
  s = s.replace(/\D/g, '');
  return s ? groupInt(s) : '';
}

function toNumber(raw) {
  const s = stripGroup(raw).replace(/[^\d.]/g, '');
  if (s === '' || s === '.') return '';
  const n = Number(s);
  return isNaN(n) ? '' : n;
}

const displayOf = (v, allowDecimal) =>
  (v === '' || v == null || (typeof v === 'number' && isNaN(v))) ? '' : formatTyping(String(v), allowDecimal);

export default function NumberInput({ value, onChange, allowDecimal = false, ...rest }) {
  const [text, setText] = useState(() => displayOf(value, allowDecimal));

  // Resync when the value changes from outside (prefill on material pick, reset, etc.) — but not
  // while the user is mid-edit (we compare parsed numbers, so "1." won't snap back to "1").
  useEffect(() => {
    const incoming = (value === '' || value == null) ? '' : Number(value);
    if (toNumber(text) !== incoming) setText(displayOf(value, allowDecimal));
  }, [value]);

  const handle = (e) => {
    const t = formatTyping(e.target.value, allowDecimal);
    setText(t);
    onChange(toNumber(t));
  };

  return <input type="text" inputMode={allowDecimal ? 'decimal' : 'numeric'} value={text} onChange={handle} {...rest} />;
}

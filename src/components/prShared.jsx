import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useStore } from '../store/StoreContext.jsx';
import { StatusPill } from './ui.jsx';
import { activeStatuses, statusDef } from '../engine/status.js';
import { fmtDate } from '../engine/format.js';

// Shared PR-table pieces — one definition each for blocks that were copy-pasted between
// PurchaseRequestsPage, AllPurchaseRequestsPage, and the PR modals.

// A PR's status timeline, newest first (the expansion row under a PR).
export function StatusHistory({ pr }) {
  const hist = pr.statusHistory || [];
  if (!hist.length) return <div className="muted" style={{ fontSize: 13 }}>No status changes recorded yet.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {[...hist].reverse().map((h, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, flexWrap: 'wrap' }}>
          <span className="muted" style={{ minWidth: 152, whiteSpace: 'nowrap' }}>
            {fmtDate(h.at)} · {new Date(h.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </span>
          {h.from ? <><StatusPill status={h.from} /><ArrowRight size={13} className="muted" /></> : <span className="muted">created as</span>}
          <StatusPill status={h.to} />
          <span className="muted">· by {h.by?.name || '—'}</span>
          {h.note && <span className="muted" style={{ fontStyle: 'italic' }}>· “{h.note}”</span>}
        </div>
      ))}
    </div>
  );
}

// The PR status <select>: forward pipeline first, closed (void) statuses in an optgroup,
// and the current status appended if it's retired/unknown so an old PR still shows its label.
export function StatusSelect({ value, onChange }) {
  const { db } = useStore();
  const act = activeStatuses(db);
  const flow = act.filter((s) => s.phase !== 'void');
  const closed = act.filter((s) => s.phase === 'void');
  const cur = statusDef(db, value);
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      {flow.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      {closed.length > 0 && (
        <optgroup label="Closed">
          {closed.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </optgroup>
      )}
      {(cur.retired || cur.missing) && <option value={cur.id}>{cur.label} (retired)</option>}
    </select>
  );
}

// Read-only cousin of StagedChangesBanner for pages that can STAGE changes but not commit
// them (Schedule, Dashboard) — without this, staging a receipt there looks like nothing
// happened. Links to the page where the review & commit actually lives.
export function PendingReviewBanner({ count, to = '/purchase-requests' }) {
  if (!count) return null;
  return (
    <div className="banner" style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1E40AF', borderRadius: 10, padding: '9px 14px', marginBottom: 14, fontSize: 13.3, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <b>{count} pending status change{count > 1 ? 's' : ''}</b>
      <span style={{ opacity: 0.85 }}>— staged, waiting for review.</span>
      <Link to={to} style={{ marginLeft: 'auto', fontWeight: 600, color: '#1E40AF', whiteSpace: 'nowrap' }}>Review &amp; commit →</Link>
    </div>
  );
}

// Inline marker for a PR whose status change is staged — replaces the action button so the
// user sees their click registered.
export function PendingPill({ title = 'Staged — review & commit on the Purchase Requests page' }) {
  return <span className="pill amber" title={title}>Receipt pending</span>;
}

// The blue "staged, not yet committed" banner with its arm-then-confirm discard flow.
// Owns the armed state, so pages no longer each carry a `discardArmed` useState.
export function StagedChangesBanner({ count, noun = 'pending status change', detail, onDiscard, onCommit, style }) {
  const [armed, setArmed] = useState(false);
  if (!count) return null;
  return (
    <div className="banner" style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1E40AF', borderRadius: 10, padding: '9px 14px', marginBottom: 14, fontSize: 13.3, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', ...style }}>
      <b>{count} {noun}{count > 1 ? 's' : ''}</b>
      <span style={{ opacity: 0.85 }}>— {detail}</span>
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
        {armed ? (
          <>
            <span style={{ color: 'var(--risk)' }}>Discard all?</span>
            <button className="btn sm danger" onClick={() => { onDiscard(); setArmed(false); }}>Confirm discard</button>
            <button className="btn sm ghost" onClick={() => setArmed(false)}>Keep</button>
          </>
        ) : (
          <>
            <button className="btn sm ghost" onClick={() => setArmed(true)}>Discard</button>
            <button className="btn sm primary" onClick={onCommit}>Review &amp; commit</button>
          </>
        )}
      </span>
    </div>
  );
}

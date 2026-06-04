import { useState } from 'react';
import { useStore } from '../store/StoreContext.jsx';
import Modal from '../components/Modal.jsx';
import { FilterBar, FilterSearch, FilterSelect } from '../components/ui.jsx';

const ROLES = ['Estimator', 'Project Manager', 'Purchasing PIC'];

export default function UsersPage() {
  const { db, addUser, updateUser, deleteUser } = useStore();
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = new, object = edit
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const meId = db.currentUser?.id;
  const prCount = (id) => db.prs.filter((p) => p.picId === id).length;
  const filtered = db.users.filter((u) => {
    if (roleFilter && u.role !== roleFilter) return false;
    if (q && !u.name.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <>
      <div className="page-head" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1>Team</h1>
          <p className="sub">The people who use this app — estimators, project managers, and purchasing PICs. These are staff records, not login accounts.</p>
        </div>
        <button className="btn primary" onClick={() => setEditing(null)}>+ Add person</button>
      </div>

      <FilterBar shown={filtered.length} total={db.users.length} unit="people">
        <FilterSearch value={q} onChange={setQ} placeholder="Search name…" />
        <FilterSelect value={roleFilter} onChange={setRoleFilter} allLabel="All roles" width={190}
          options={ROLES.map((r) => ({ value: r, label: r }))} />
      </FilterBar>

      <div className="card">
        <div className="card-body flush">
          <table className="table">
            <thead><tr><th>Name</th><th>Role</th><th className="num">On PRs (as PIC)</th><th></th></tr></thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>
                    {u.name}
                    {u.id === meId && <span className="pill info" style={{ marginLeft: 8 }}>you</span>}
                  </td>
                  <td><span className="pill gray">{u.role}</span></td>
                  <td className="num">{prCount(u.id)}</td>
                  <td className="num"><button className="btn sm ghost" onClick={() => setEditing(u)}>Edit</button></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={4}><div className="empty">{db.users.length === 0 ? 'No team members yet.' : 'No people match these filters.'}</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing !== undefined && (
        <UserModal
          user={editing}
          prCount={editing ? prCount(editing.id) : 0}
          isCurrent={!!editing && editing.id === meId}
          onClose={() => setEditing(undefined)}
          onSave={(data) => { if (editing) updateUser(editing.id, data); else addUser(data); setEditing(undefined); }}
          onDelete={() => { deleteUser(editing.id); setEditing(undefined); }}
        />
      )}
    </>
  );
}

function UserModal({ user, prCount, isCurrent, onClose, onSave, onDelete }) {
  const [name, setName] = useState(user?.name || '');
  const [role, setRole] = useState(user?.role || 'Purchasing PIC');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const editing = !!user;
  const trimmed = name.trim();
  const lockReason = isCurrent
    ? 'This is the signed-in user'
    : (prCount > 0 ? `Set as PIC on ${prCount} PR${prCount === 1 ? '' : 's'} — reassign before deleting` : '');
  const locked = !!lockReason;

  return (
    <Modal
      title={editing ? `Edit · ${user.name}` : 'Add team member'}
      onClose={onClose}
      footer={<>
        {editing && (
          locked ? (
            <span className="muted" style={{ marginRight: 'auto', fontSize: 12.5 }}>{lockReason}</span>
          ) : confirmingDelete ? (
            <span style={{ marginRight: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span className="muted" style={{ fontSize: 13 }}>Remove this person?</span>
              <button className="btn sm danger" onClick={onDelete}>Confirm delete</button>
              <button className="btn sm ghost" onClick={() => setConfirmingDelete(false)}>Keep</button>
            </span>
          ) : (
            <button className="btn sm ghost" style={{ marginRight: 'auto', color: 'var(--risk)' }}
              onClick={() => setConfirmingDelete(true)}>Delete…</button>
          )
        )}
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!trimmed || !role} onClick={() => onSave({ name: trimmed, role })}>
          {editing ? 'Save changes' : 'Add person'}
        </button>
      </>}
    >
      <label className="lbl">Name <span className="req">*</span></label>
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rina Hapsari" autoFocus />

      <label className="lbl" style={{ marginTop: 14 }}>Role <span className="req">*</span></label>
      <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      <p className="help" style={{ marginBottom: 0 }}>Only <b>Purchasing PIC</b> appears in the Purchase Request PIC dropdown.</p>
    </Modal>
  );
}

import { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

// App-wide toast notifications (top right). Import { toast } anywhere and call
//   toast.success('Project created')   — green, auto-dismisses in 3.5s
//   toast.error('Missing fields')      — red, sticks a bit longer (6s)
// A module-level emitter (not context) so non-component code can fire toasts too.
let push = null;
let nextId = 1;
export const toast = {
  success(message) { push?.({ id: nextId++, kind: 'success', message }); },
  error(message) { push?.({ id: nextId++, kind: 'error', message }); },
};

export default function ToastHost() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const timers = new Map();
    push = (t) => {
      setToasts((prev) => [...prev.slice(-4), t]); // keep at most 5 on screen
      timers.set(t.id, setTimeout(() => {
        timers.delete(t.id);
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, t.kind === 'error' ? 6000 : 3500));
    };
    return () => { push = null; timers.forEach(clearTimeout); };
  }, []);

  if (toasts.length === 0) return null;
  return (
    <div className="toast-host" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.kind === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span className="toast-msg">{t.message}</span>
          <button className="toast-x" aria-label="Dismiss" onClick={() => setToasts((p) => p.filter((x) => x.id !== t.id))}><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}

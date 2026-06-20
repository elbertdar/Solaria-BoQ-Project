import { Fragment } from 'react';
import { ArrowRight } from 'lucide-react';
import { fmtDate } from '../engine/format.js';

// One distinct hue per region group, so bars read as families at a glance.
const REGION_COLORS = ['#0F172A', '#0891B2', '#7C3AED', '#16A34A', '#D97706', '#DB2777', '#2563EB', '#0D9488', '#9333EA', '#DC2626'];

export default function PortfolioGantt({ gantt, onOpen }) {
  if (!gantt.regions.length) {
    return (
      <div className="empty">
        No confirmed BoQs yet. Finalize a project’s BoQ — and give its lines needed-by days — to see its
        procurement window here.
      </div>
    );
  }

  // Pad the axis to whole months around the overall window.
  const axisStart = new Date(gantt.min.getFullYear(), gantt.min.getMonth(), 1);
  const axisEnd = new Date(gantt.max.getFullYear(), gantt.max.getMonth() + 1, 1);
  const spanMs = axisEnd - axisStart;
  const pct = (d) => ((d - axisStart) / spanMs) * 100;

  const months = [];
  let cur = new Date(axisStart);
  while (cur < axisEnd) {
    const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    const showYear = months.length === 0 || cur.getMonth() === 0;
    const label = cur.toLocaleDateString('en-GB', { month: 'short' }) + (showYear ? ` ${cur.getFullYear()}` : '');
    months.push({ label, leftPct: pct(cur), widthPct: ((next - cur) / spanMs) * 100 });
    cur = next;
  }

  const todayPct = (gantt.today >= axisStart && gantt.today < axisEnd) ? pct(gantt.today) : null;

  let regionIdx = 0;
  return (
    <div className="pg">
      <div className="pg-row pg-head">
        <div className="pg-label" />
        <div className="pg-track pg-axis">
          {months.map((m, i) => (
            <div key={i} className="pg-month" style={{ left: m.leftPct + '%', width: m.widthPct + '%' }}>{m.label}</div>
          ))}
          {todayPct != null && <div className="pg-today" style={{ left: todayPct + '%' }} title={`Today · ${fmtDate(gantt.today)}`} />}
        </div>
      </div>

      {gantt.regions.map((rg) => {
        const color = REGION_COLORS[regionIdx++ % REGION_COLORS.length];
        return (
          <Fragment key={rg.region}>
            <div className="pg-region">{rg.region} · {rg.projects.length} {rg.projects.length === 1 ? 'project' : 'projects'}</div>
            {rg.projects.map((p) => {
              const left = pct(p.start);
              const width = Math.max(0.8, pct(p.end) - left);
              return (
                <div className="pg-row" key={p.id}>
                  <div className="pg-label">
                    <div className="pg-code" title={p.code ? `${p.name} (${p.code})` : p.name}>{p.name}</div>
                    <div className="muted pg-dates" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{fmtDate(p.start)} <ArrowRight size={11} /> {fmtDate(p.end)} · {p.durationDays}d</div>
                  </div>
                  <div className="pg-track">
                    {months.map((m, i) => <div key={i} className="pg-grid" style={{ left: m.leftPct + '%' }} />)}
                    {todayPct != null && <div className="pg-today" style={{ left: todayPct + '%' }} />}
                    <div
                      className="pg-bar"
                      style={{ left: left + '%', width: width + '%', background: color, opacity: p.active ? 1 : 0.78 }}
                      title={`${p.name}: ${fmtDate(p.start)} → ${fmtDate(p.end)} · ${p.durationDays} days · ${p.lineCount} scheduled lines`}
                      onClick={() => onOpen(p.id)}
                    >
                      <span className="pg-bar-label">{p.name.replace(/^Solaria\s*[—-]\s*/, '')}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </Fragment>
        );
      })}
    </div>
  );
}

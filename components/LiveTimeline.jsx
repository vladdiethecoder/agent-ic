'use client';

function formatTime(ts) {
  if (!ts) return '—';
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return ts;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function LiveTimeline({ audit, runId }) {
  if (!audit || audit.length === 0) {
    return (
      <div className="live-timeline" data-run-id={runId}>
        <div className="live-timeline-empty">Waiting for live audit events…</div>
      </div>
    );
  }

  return (
    <div className="live-timeline" data-run-id={runId}>
      <ul className="live-timeline-list">
        {audit.map((row) => {
          const kind = row.kind || 'manual';
          return (
            <li key={row.id} className={`live-timeline-row kind-${kind}`} data-kind={kind}>
              <time className="live-timeline-time">{formatTime(row.ts)}</time>
              <div className="live-timeline-body">
                <div className="live-timeline-head">
                  <strong className="live-timeline-actor">{row.actor}</strong>
                  <span className={`kind-badge ${kind}`}>{kind}</span>
                </div>
                <div className="live-timeline-action">{row.action}</div>
                {row.detail && <small className="live-timeline-detail">{row.detail}</small>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

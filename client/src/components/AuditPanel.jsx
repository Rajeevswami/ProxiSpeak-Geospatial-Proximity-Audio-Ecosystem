/** Optional geospatial and WebRTC diagnostics, tucked away from the everyday room controls. */
import { useState } from 'react';
import { useProxi } from '../state/ProxiContext.jsx';

export function AuditPanel() {
  const { state, requestAudit, peersRef } = useProxi();
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const report = state.stats.audit;
  const mesh = peersRef.current?.snapshot() ?? [];

  return (
    <section className={`panel audit${expanded ? ' audit--open' : ''}`}>
      <button
        className="audit__toggle"
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((open) => !open)}
      >
        <span className="audit__toggle-icon" aria-hidden="true">⌁</span>
        <span className="audit__toggle-copy">
          <strong>Advanced diagnostics</strong>
          <small>Spatial index and voice-link health</small>
        </span>
        <span className="audit__chevron" aria-hidden="true">{expanded ? '−' : '+'}</span>
      </button>

      {expanded && (
        <div className="audit__content">
          <header className="panel__header">
            <div>
              <p className="eyebrow">DATABASE CHECK</p>
              <h2>Spatial audit</h2>
            </div>
            <button
              className="button button--small"
              disabled={running || !state.selfId}
              onClick={async () => {
                setRunning(true);
                try {
                  await requestAudit();
                } finally {
                  setRunning(false);
                }
              }}
            >
              {running ? 'Running…' : 'Run audit'}
            </button>
          </header>

          {!report && <p className="panel__empty">Measures MongoDB proximity-query accuracy and latency.</p>}

          {report && (
            <>
              <div className={`verdict ${report.ok ? 'verdict--ok' : 'verdict--bad'}`}>
                {report.ok ? `Healthy · under ${report.budgetMs}ms` : 'Needs attention'}
              </div>
              <dl className="audit__grid">
                <div><dt>$near p95</dt><dd>{report.queries?.near?.p95Ms}ms</dd></div>
                <div><dt>$geoWithin p95</dt><dd>{report.queries?.within?.p95Ms}ms</dd></div>
                <div><dt>$geoNear p95</dt><dd>{report.queries?.cluster?.p95Ms}ms</dd></div>
                <div><dt>peers matched</dt><dd>{report.accuracy?.matchedPeers}</dd></div>
                <div><dt>operators agree</dt><dd>{report.accuracy?.operatorsAgree ? 'Yes' : 'No'}</dd></div>
                <div><dt>distance drift</dt><dd>{report.accuracy?.maxDistanceDriftPx}px</dd></div>
                <div><dt>geo index</dt><dd>{report.index?.indexName ?? 'n/a'}</dd></div>
                <div><dt>query plan</dt><dd>{report.index?.stage ?? 'n/a'}</dd></div>
              </dl>
            </>
          )}

          <header className="panel__header panel__header--sub">
            <div>
              <p className="eyebrow">PEER-TO-PEER</p>
              <h3>Voice mesh</h3>
            </div>
            <span className="panel__meta">{mesh.length} link{mesh.length === 1 ? '' : 's'}</span>
          </header>
          {mesh.length === 0 && <p className="panel__empty">No live links yet. Join another person and move close.</p>}
          <ul className="mesh__list">
            {mesh.slice(0, 8).map((peer) => (
              <li key={peer.id}>
                <span className="chip">{peer.id.slice(0, 6)}</span>
                <span>{peer.state}</span>
                <span className="panel__meta">{peer.stats?.rtt ? `${Math.round(peer.stats.rtt * 1000)}ms RTT` : 'RTT n/a'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default AuditPanel;

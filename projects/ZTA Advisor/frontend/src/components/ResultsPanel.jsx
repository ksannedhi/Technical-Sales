import { useState } from 'react';

const PILLAR_ORDER = ['identity', 'devices', 'networks', 'applications', 'data', 'visibility'];
const PILLAR_LABELS = {
  identity: 'Identity',
  devices: 'Devices',
  networks: 'Networks',
  applications: 'Applications & Workloads',
  data: 'Data',
  visibility: 'Visibility & Analytics'
};

const TIMELINE_CONFIG = [
  { key: 'short', label: 'Immediate Actions', sub: '0–90 days', color: '#dc2626', bg: '#fef2f2' },
  { key: 'medium', label: 'Medium-term', sub: '90–180 days', color: '#f59e0b', bg: '#fffbeb' },
  { key: 'long', label: 'Strategic', sub: '180+ days', color: '#3b82f6', bg: '#eff6ff' }
];

function maturityLabel(score) {
  if (score < 1.5) return 'Traditional';
  if (score < 2.5) return 'Initial';
  if (score < 3.5) return 'Advanced';
  return 'Optimal';
}

function maturityColor(score) {
  if (score < 1.5) return '#dc2626';
  if (score < 2.5) return '#f59e0b';
  if (score < 3.5) return '#3b82f6';
  return '#10b981';
}

function gapBadge(gap) {
  if (gap >= 2) return { label: 'Critical', color: '#dc2626', bg: '#fef2f2' };
  if (gap >= 1) return { label: 'High', color: '#f59e0b', bg: '#fffbeb' };
  if (gap > 0) return { label: 'Medium', color: '#3b82f6', bg: '#eff6ff' };
  return { label: 'On Target', color: '#10b981', bg: '#f0fdf4' };
}

export default function ResultsPanel({ results, orgProfile, frameworkIds, onReset }) {
  const { pillarScores, roadmap, overallScore, narrative } = results;
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState(null);

  const overallColor = maturityColor(overallScore);
  const overallLabel = maturityLabel(overallScore);
  const totalActions = (roadmap.short?.length || 0) + (roadmap.medium?.length || 0) + (roadmap.long?.length || 0);

  async function handleExportPdf() {
    setExportLoading(true);
    setExportError(null);
    try {
      const res = await fetch('/api/export/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...results, meta: { orgProfile, frameworkIds, assessedAt: new Date().toISOString() } })
      });
      if (!res.ok) throw new Error('PDF generation failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zta-assessment-${(orgProfile?.orgName || 'report').toLowerCase().replace(/[^a-z0-9]/g, '-')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError('PDF export failed. Please try again.');
    } finally {
      setExportLoading(false);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)' }}>Assessment Results</h2>
          <p className="text-muted mt-4">{orgProfile?.orgName} · {totalActions} remediation actions identified</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={onReset} type="button">New Assessment</button>
          <button
            className="btn btn-pdf"
            onClick={handleExportPdf}
            disabled={exportLoading}
            type="button"
          >
            {exportLoading ? <><span className="spinner" /> Exporting…</> : '↓ Export PDF'}
          </button>
        </div>
      </div>

      {exportError && (
        <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{exportError}</div>
      )}

      {/* Score hero */}
      <div className="score-hero" style={{ marginBottom: 24 }}>
        <div className="score-ring" style={{ borderColor: overallColor }}>
          <div className="score-num" style={{ color: overallColor }}>{overallScore.toFixed(1)}</div>
          <div className="score-denom">/4.0</div>
        </div>
        <div className="score-meta">
          <h2 style={{ color: '#fff' }}>{overallLabel} ZT Maturity</h2>
          <p>
            Overall maturity across {PILLAR_ORDER.length} pillars.
            Target: <strong style={{ color: '#60a5fa' }}>Advanced (3.0)</strong>
          </p>
          {frameworkIds?.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {frameworkIds.map(id => (
                <span key={id} style={{ background: '#1e3a5f', color: '#93c5fd', fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
                  {id.toUpperCase()}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Narrative */}
      {narrative && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-title">Executive Summary</div>
          <div className="narrative-text">{narrative}</div>
        </div>
      )}

      {/* Gap analysis table */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">Pillar Maturity & Gap Analysis</div>
        <table className="gap-table">
          <thead>
            <tr>
              <th>Pillar</th>
              <th>Current Maturity</th>
              <th>Target</th>
              <th>Gap Priority</th>
            </tr>
          </thead>
          <tbody>
            {PILLAR_ORDER.map(p => {
              const s = pillarScores[p];
              const badge = gapBadge(s.gap);
              const barWidth = Math.round((s.current / 4) * 100);
              return (
                <tr key={p}>
                  <td style={{ fontWeight: 600 }}>{PILLAR_LABELS[p]}</td>
                  <td>
                    <div className="maturity-bar-wrap">
                      <div className="maturity-bar-bg">
                        <div
                          className="maturity-bar-fill"
                          style={{ width: `${barWidth}%`, background: maturityColor(s.current) }}
                        />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: maturityColor(s.current), minWidth: 110 }}>
                        {maturityLabel(s.current)} ({s.current.toFixed(1)})
                      </span>
                    </div>
                  </td>
                  <td style={{ color: 'var(--muted)', fontSize: 13 }}>Advanced (3.0)</td>
                  <td>
                    <span className="badge" style={{ background: badge.bg, color: badge.color }}>
                      {badge.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Remediation roadmap */}
      <div className="card">
        <div className="card-title">Prioritized Remediation Roadmap</div>

        {TIMELINE_CONFIG.map(({ key, label, sub, color, bg }) => {
          const items = roadmap[key] || [];
          if (!items.length) return null;
          return (
            <div key={key} className="timeline-section">
              <div className="timeline-header">
                <div className="timeline-dot" style={{ background: color }} />
                <span className="timeline-label" style={{ color }}>{label}</span>
                <span className="timeline-count" style={{ color }}>({sub})</span>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>
                  {items.length} action{items.length !== 1 ? 's' : ''}
                </span>
              </div>

              {items.map((ctrl, i) => (
                <div key={i} className="ctrl-card" style={{ borderLeftColor: color }}>
                  <div className="ctrl-card-row">
                    <div>
                      <div className="ctrl-title">{ctrl.title}</div>
                      <div className="ctrl-desc">{ctrl.description}</div>
                    </div>
                    <span className="ctrl-pillar-chip">{PILLAR_LABELS[ctrl.pillar] || ctrl.pillar}</span>
                  </div>
                </div>
              ))}
            </div>
          );
        })}

        {totalActions === 0 && (
          <div style={{ color: 'var(--green)', fontWeight: 600, padding: '12px 0' }}>
            All pillars are at or above target maturity. Excellent ZT posture!
          </div>
        )}
      </div>
    </div>
  );
}

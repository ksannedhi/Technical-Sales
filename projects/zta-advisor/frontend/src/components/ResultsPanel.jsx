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

const ROADMAP_CAP = 5;
const CISA_LABELS = ['Traditional', 'Initial', 'Advanced', 'Optimal'];
const RADAR_LABELS = {
  identity: 'Identity', devices: 'Devices', networks: 'Networks',
  applications: 'Apps', data: 'Data', visibility: 'Visibility'
};

function maturityLabel(score, labels = CISA_LABELS) {
  if (score < 1.5) return labels[0];
  if (score < 2.5) return labels[1];
  if (score < 3.5) return labels[2];
  return labels[3];
}

function RadarChart({ pillarScores }) {
  const SIZE = 280, cx = 140, cy = 140, R = 95;
  const pillars = PILLAR_ORDER;
  const N = pillars.length;

  function toXY(i, fraction) {
    const rad = (-90 + i * (360 / N)) * Math.PI / 180;
    return [cx + R * fraction * Math.cos(rad), cy + R * fraction * Math.sin(rad)];
  }

  function points(fractions) {
    return fractions.map((f, i) => toXY(i, f).join(',')).join(' ');
  }

  const scores = pillars.map(p => (pillarScores[p]?.current || 1) / 4);
  const grids = [0.25, 0.5, 0.75, 1];

  return (
    <svg width={SIZE} height={SIZE} style={{ display: 'block', margin: '0 auto' }}>
      {grids.map(f => <polygon key={f} points={points(pillars.map(() => f))} fill="none" stroke="#e5e7eb" strokeWidth="1" />)}
      {pillars.map((_, i) => { const [x, y] = toXY(i, 1); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#e5e7eb" strokeWidth="1" />; })}
      <polygon points={points(pillars.map(() => 3 / 4))} fill="#3b82f610" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="4 3" />
      <polygon points={points(scores)} fill="#0f172a20" stroke="#0f172a" strokeWidth="2" />
      {pillars.map((p, i) => { const f = (pillarScores[p]?.current || 1) / 4; const [x, y] = toXY(i, f); return <circle key={p} cx={x} cy={y} r="4" fill={maturityColor(pillarScores[p]?.current || 1)} stroke="#fff" strokeWidth="1.5" />; })}
      {pillars.map((p, i) => { const [x, y] = toXY(i, 1.25); return <text key={p} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="#374151" fontWeight="600">{RADAR_LABELS[p]}</text>; })}
      {grids.map(f => { const [x, y] = toXY(0, f); return <text key={f} x={x + 5} y={y} fontSize="9" fill="#9ca3af" dominantBaseline="middle">{f * 4}</text>; })}
    </svg>
  );
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

export default function ResultsPanel({ results, orgProfile, frameworkIds, allFrameworks = [], onReset }) {
  const { pillarScores, roadmap, overallScore, narrative, maturityLabels } = results;
  const labels = Array.isArray(maturityLabels) && maturityLabels.length === 4 ? maturityLabels : CISA_LABELS;
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState(null);
  const [expanded, setExpanded] = useState({ short: false, medium: false, long: false });
  const [notes, setNotes] = useState('');

  const overallColor = maturityColor(overallScore);
  const overallLabel = maturityLabel(overallScore, labels);
  const totalActions = (roadmap.short?.length || 0) + (roadmap.medium?.length || 0) + (roadmap.long?.length || 0);

  async function handleExportPdf() {
    setExportLoading(true);
    setExportError(null);
    try {
      const res = await fetch('/api/export/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...results, notes, meta: { orgProfile, frameworkIds, assessedAt: new Date().toISOString() } })
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
        <button className="btn btn-outline" onClick={onReset} type="button">New Assessment</button>
      </div>

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
              {frameworkIds.map(id => {
                const fw = allFrameworks.find(f => f.id === id);
                return (
                  <span key={id} style={{ background: '#1e3a5f', color: '#93c5fd', fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
                    {fw?.shortName || id.toUpperCase()}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Radar chart */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">Maturity Radar</div>
        <RadarChart pillarScores={pillarScores} />
        <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 12, fontSize: 11, color: 'var(--muted)' }}>
          <span><span style={{ display: 'inline-block', width: 24, height: 2, background: '#0f172a', verticalAlign: 'middle', marginRight: 4 }} />Current</span>
          <span><span style={{ display: 'inline-block', width: 24, height: 2, background: '#3b82f6', borderTop: '2px dashed #3b82f6', verticalAlign: 'middle', marginRight: 4 }} />Target (3.0)</span>
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
                        {maturityLabel(s.current, labels)} ({s.current.toFixed(1)})
                      </span>
                    </div>
                  </td>
                  <td style={{ color: 'var(--muted)', fontSize: 13 }}>{labels[2]} (3.0)</td>
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
        <div className="card-title">
          Prioritized Remediation Roadmap
          <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)', marginLeft: 8 }}>
            — top {ROADMAP_CAP} per bucket shown · expand to see all
          </span>
        </div>

        {TIMELINE_CONFIG.map(({ key, label, sub, color }) => {
          const items = roadmap[key] || [];
          if (!items.length) return null;
          const isExpanded = expanded[key];
          const visible = isExpanded ? items : items.slice(0, ROADMAP_CAP);
          const hidden = items.length - ROADMAP_CAP;
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

              {visible.map((ctrl, i) => {
                const matchingFw = (ctrl.frameworks || [])
                  .filter(id => frameworkIds?.includes(id))
                  .map(id => allFrameworks.find(f => f.id === id)?.shortName)
                  .filter(Boolean);
                return (
                  <div key={i} className="ctrl-card" style={{ borderLeftColor: color }}>
                    <div className="ctrl-card-row">
                      <div>
                        <div className="ctrl-title">{ctrl.title}</div>
                        <div className="ctrl-desc">{ctrl.description}</div>
                        {matchingFw.length > 0 && (
                          <div className="ctrl-fw-chips">
                            {matchingFw.map(name => (
                              <span key={name} className="ctrl-fw-chip">{name}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="ctrl-pillar-chip">{PILLAR_LABELS[ctrl.pillar] || ctrl.pillar}</span>
                    </div>
                  </div>
                );
              })}

              {items.length > ROADMAP_CAP && (
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ marginTop: 8, fontSize: 12, padding: '4px 12px' }}
                  onClick={() => setExpanded(e => ({ ...e, [key]: !e[key] }))}
                >
                  {isExpanded ? '▲ Show top 5 only' : `▼ Show ${hidden} more action${hidden !== 1 ? 's' : ''}`}
                </button>
              )}
            </div>
          );
        })}

        {totalActions === 0 && (
          <div style={{ color: 'var(--green)', fontWeight: 600, padding: '12px 0' }}>
            All pillars are at or above target maturity. Excellent ZT posture!
          </div>
        )}
      </div>

      {/* PE session notes */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-title">Session Notes <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)' }}>— PE only · included in PDF export</span></div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Capture key prospect statements, agreed next steps, follow-up owners, or context not covered by the structured questions…"
          rows={5}
          style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: 13, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', background: 'var(--surface)', lineHeight: 1.6 }}
        />
      </div>

      {/* Bottom action row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 }}>
        {exportError && <span style={{ color: 'var(--red)', fontSize: 13 }}>{exportError}</span>}
        <span /> {/* spacer when no error */}
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
  );
}

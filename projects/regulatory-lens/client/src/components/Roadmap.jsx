const PRIORITY_STYLE = {
  immediate:    { bg: '#FCEBEB', color: '#A32D2D', label: 'Immediate' },
  'short-term': { bg: '#FAECE7', color: '#993C1D', label: 'Short-term' },
  'medium-term':{ bg: '#FAEEDA', color: '#633806', label: 'Medium-term' },
  planned:      { bg: '#EAF3DE', color: '#27500A', label: 'Planned' },
};

const EFFORT_STYLE = {
  low:       { bg: '#EAF3DE', color: '#27500A' },
  medium:    { bg: '#FAEEDA', color: '#633806' },
  high:      { bg: '#FAECE7', color: '#993C1D' },
  'very-high':{ bg: '#FCEBEB', color: '#A32D2D' },
};

export default function Roadmap({ roadmap, onBack }) {
  console.log('[Roadmap] mounted. roadmap:', roadmap);
  if (!roadmap) {
    console.warn('[Roadmap] component mounted with roadmap=null or undefined — check API response');
    return (
      <div className="card">
        <div className="step-label">Step 5 of 5 — Implementation roadmap</div>
        <h2 className="step-title">Weighted implementation roadmap</h2>
        <div style={{ marginBottom: '12px' }}>
          <button className="btn" onClick={onBack}>← Back to posture</button>
        </div>
        <div style={{ color: '#E24B4A', fontSize: '14px', fontWeight: 500 }}>⚠ No roadmap data received. This may indicate an API error — check the browser console.</div>
      </div>
    );
  }
  console.log('[Roadmap] rendering with full data');
  const items = roadmap.roadmapItems || [];

  return (
    <div className="card">
      <div className="step-label">Step 5 of 5 — Implementation roadmap</div>
      <h2 className="step-title">Weighted implementation roadmap</h2>

      <div style={{ marginBottom: '12px' }}>
        <button className="btn" onClick={onBack}>← Back to posture</button>
      </div>

      {roadmap.executiveSummary && (
        <div className="disclaimer-box" style={{ marginBottom: '20px' }}>
          <p style={{ fontSize: '13px', lineHeight: 1.65 }}>{roadmap.executiveSummary}</p>
          <div style={{ display: 'flex', gap: '20px', marginTop: '10px', fontSize: '12px' }}>
            <span style={{ color: '#A32D2D', fontWeight: 600 }}>⚠ {roadmap.criticalGaps} critical gaps</span>
            <span style={{ color: '#888' }}>{roadmap.totalGaps} total gaps identified</span>
          </div>
        </div>
      )}

      <div className="roadmap-list">
        {items.map((item, i) => {
          const ps = PRIORITY_STYLE[item.priority] || PRIORITY_STYLE.planned;
          const effortKey = (item.estimatedEffort || '').toLowerCase().replace(/\s+/g, '-');
          const es = EFFORT_STYLE[effortKey] || { bg: '#F1F5F9', color: '#64748B' };
          const actions  = item.recommendedActions || [];
          const wins     = item.quickWins || [];
          const gaps     = item.mandatoryFrameworkGaps || [];

          return (
            <div key={item.domainId || i} className="roadmap-row">

              {/* ── Rank ── */}
              <div className="roadmap-rank">{item.rank || i + 1}</div>

              {/* ── Body ── */}
              <div className="roadmap-body">

                {/* Header row: domain + priority badge + effort badge + score */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                  <span className="domain-name">{item.domainLabel}</span>
                  <span style={{ background: ps.bg, color: ps.color, fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px' }}>
                    {ps.label}
                  </span>
                  {item.estimatedEffort && (
                    <span style={{ background: es.bg, color: es.color, fontSize: '10px', fontWeight: 500, padding: '2px 8px', borderRadius: '20px' }}>
                      Effort: {item.estimatedEffort}
                    </span>
                  )}
                  {item.weightedScore != null && (
                    <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#94A3B8', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      Score {item.weightedScore}
                    </span>
                  )}
                </div>

                {/* Mandatory framework gaps */}
                {gaps.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '10px', color: '#A32D2D', fontWeight: 600, marginRight: '2px', alignSelf: 'center' }}>Mandatory gaps:</span>
                    {gaps.map(g => (
                      <span key={g} style={{ background: '#FCEBEB', color: '#A32D2D', fontSize: '10px', fontWeight: 500, padding: '1px 7px', borderRadius: '12px' }}>{g}</span>
                    ))}
                  </div>
                )}

                {/* Recommended actions — all up to 5 */}
                {actions.length > 0 && (
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Recommended actions</div>
                    {actions.slice(0, 5).map((a, j) => (
                      <div key={j} style={{ fontSize: '12px', color: '#334155', marginTop: '3px', paddingLeft: '10px', borderLeft: '2px solid #E2E8F0', lineHeight: 1.5 }}>
                        {a}
                      </div>
                    ))}
                  </div>
                )}

                {/* Quick wins — both if present */}
                {wins.length > 0 && (
                  <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '6px', padding: '6px 10px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 600, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>⚡ Quick wins (≤ 2 weeks)</div>
                    {wins.slice(0, 2).map((w, j) => (
                      <div key={j} style={{ fontSize: '12px', color: '#166534', marginTop: j > 0 ? '3px' : 0 }}>• {w}</div>
                    ))}
                  </div>
                )}

              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

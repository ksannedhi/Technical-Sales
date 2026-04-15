const PRIORITY_STYLE = {
  immediate:    { bg: '#FCEBEB', color: '#A32D2D', label: 'Immediate' },
  'short-term': { bg: '#FAECE7', color: '#993C1D', label: 'Short-term' },
  'medium-term':{ bg: '#FAEEDA', color: '#633806', label: 'Medium-term' },
  planned:      { bg: '#EAF3DE', color: '#27500A', label: 'Planned' },
};

export default function Roadmap({ roadmap }) {
  if (!roadmap) return null;
  const items = roadmap.roadmapItems || [];

  return (
    <div className="card">
      <div className="step-label">Step 5 of 5 — Implementation roadmap</div>
      <h2 className="step-title">Weighted implementation roadmap</h2>

      {roadmap.executiveSummary && (
        <div className="disclaimer-box" style={{ marginBottom: '16px' }}>
          <p style={{ fontSize: '13px', lineHeight: 1.65 }}>{roadmap.executiveSummary}</p>
          <div style={{ display: 'flex', gap: '16px', marginTop: '10px', fontSize: '12px' }}>
            <span style={{ color: '#A32D2D', fontWeight: 500 }}>{roadmap.criticalGaps} critical gaps</span>
            <span style={{ color: '#888' }}>{roadmap.totalGaps} total gaps identified</span>
          </div>
        </div>
      )}

      <div className="roadmap-list">
        {items.map((item, i) => {
          const ps = PRIORITY_STYLE[item.priority] || PRIORITY_STYLE.planned;
          return (
            <div key={item.domainId || i} className="roadmap-row">
              <div className="roadmap-rank">{item.rank || i+1}</div>
              <div className="roadmap-body">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span className="domain-name">{item.domainLabel}</span>
                  <span style={{ background: ps.bg, color: ps.color, fontSize: '10px', fontWeight: 500, padding: '2px 8px', borderRadius: '20px' }}>{ps.label}</span>
                </div>
                {(item.recommendedActions||[]).slice(0,3).map((a,j) => (
                  <div key={j} style={{ fontSize: '12px', color: '#555', marginTop: '3px', paddingLeft: '10px', borderLeft: '2px solid #E5E5E5' }}>{a}</div>
                ))}
                {(item.quickWins||[]).length > 0 && (
                  <div style={{ fontSize: '11px', color: '#3B6D11', marginTop: '5px' }}>
                    Quick win: {item.quickWins[0]}
                  </div>
                )}
                {(item.mandatoryFrameworkGaps||[]).length > 0 && (
                  <div style={{ fontSize: '10px', color: '#A32D2D', marginTop: '4px' }}>
                    Mandatory gap: {item.mandatoryFrameworkGaps.join(', ')}
                  </div>
                )}
              </div>
              <div style={{ fontSize: '11px', color: '#AAA', flexShrink: 0 }}>{item.estimatedEffort}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

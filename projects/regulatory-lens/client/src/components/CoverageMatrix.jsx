const COV_STYLE = {
  'full':          { bg: '#E1F5EE', color: '#0F6E56', label: 'Full' },
  'partial':       { bg: '#FAEEDA', color: '#633806', label: 'Partial' },
  'not-addressed': { bg: '#F5F5F5', color: '#AAAAAA', label: '—' },
  'unknown':       { bg: '#F5F5F5', color: '#CCCCCC', label: '?' },
};

export default function CoverageMatrix({ results, selectedFrameworks }) {
  return (
    <div className="card">
      <div className="step-label">Step 3 of 5 — Harmonisation results</div>
      <h2 className="step-title" style={{ marginBottom: '4px' }}>Coverage matrix</h2>
      <p className="step-sub" style={{ marginBottom: '16px' }}>How each control domain is addressed across your selected frameworks.</p>

      <div style={{ overflowX: 'auto' }}>
        <table className="matrix-table">
          <thead>
            <tr>
              <th className="matrix-th-domain">Control domain</th>
              {selectedFrameworks.map(f => <th key={f} className="matrix-th">{f.replace('-',' ')}</th>)}
              <th className="matrix-th">Effort</th>
            </tr>
          </thead>
          <tbody>
            {results.map(domain => (
              <tr key={domain.domainId} className="matrix-row">
                <td className="matrix-td-domain">
                  <div className="domain-name">{domain.domainLabel}</div>
                  <div className="domain-desc">{domain.description}</div>
                </td>
                {selectedFrameworks.map(fwId => {
                  const cov = domain.coverageByFramework?.[fwId]?.coverage || 'unknown';
                  const s   = COV_STYLE[cov] || COV_STYLE.unknown;
                  return (
                    <td key={fwId} className="matrix-td-cov">
                      <span style={{ background: s.bg, color: s.color, padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 500 }}>
                        {s.label}
                      </span>
                    </td>
                  );
                })}
                <td className="matrix-td-cov">
                  <span style={{ fontSize: '11px', color: '#888' }}>{domain.estimatedEffort || '—'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="legend-row">
        {Object.entries(COV_STYLE).filter(([k])=>k!=='unknown').map(([k,v]) => (
          <span key={k} className="legend-item">
            <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: v.bg, border: `1px solid ${v.color}`, display: 'inline-block' }} />
            {v.label}
          </span>
        ))}
      </div>
    </div>
  );
}

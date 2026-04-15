import { useState } from 'react';

const COV_STYLE = {
  'full':          { bg: '#E1F5EE', color: '#0F6E56', label: 'Full' },
  'partial':       { bg: '#FAEEDA', color: '#633806', label: 'Partial' },
  'not-addressed': { bg: '#F5F5F5', color: '#AAAAAA', label: '—' },
  'unknown':       { bg: '#F5F5F5', color: '#CCCCCC', label: '?' },
};

function DomainDetail({ domain, selectedFrameworks }) {
  const covered = selectedFrameworks.filter(fwId => {
    const cov = domain.coverageByFramework?.[fwId]?.coverage;
    return cov === 'full' || cov === 'partial';
  });

  return (
    <div style={{ background: '#F8FAFC', borderTop: '1px solid #E2E8F0', padding: '14px 16px', fontSize: '12px' }}>

      {/* Harmonised summary */}
      {domain.harmonisedSummary && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '4px' }}>What frameworks collectively require</div>
          <p style={{ color: '#334155', lineHeight: 1.65 }}>{domain.harmonisedSummary}</p>
        </div>
      )}

      {/* Most demanding + implementation guidance */}
      {domain.mostDemandingFramework && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '4px' }}>
            Most demanding framework
            <span style={{ marginLeft: '8px', background: '#E0F2FE', color: '#0369A1', padding: '1px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>
              {domain.mostDemandingFramework}
            </span>
          </div>
          {domain.implementationGuidance && (
            <p style={{ color: '#334155', lineHeight: 1.65 }}>{domain.implementationGuidance}</p>
          )}
        </div>
      )}

      {/* Typical technologies */}
      {(domain.typicalTechnologies || []).length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '6px' }}>Typical technologies</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {domain.typicalTechnologies.map(t => (
              <span key={t} style={{ background: '#EFF6FF', color: '#1E40AF', fontSize: '11px', fontWeight: 500, padding: '2px 10px', borderRadius: '12px', border: '1px solid #BFDBFE' }}>{t}</span>
            ))}
          </div>
        </div>
      )}

      {/* Per-framework key requirements */}
      {covered.length > 0 && (
        <div>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '6px' }}>Key requirement by framework</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {covered.map(fwId => {
              const fw  = domain.coverageByFramework[fwId];
              const cs  = COV_STYLE[fw.coverage] || COV_STYLE.unknown;
              return (
                <div key={fwId} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <span style={{ background: cs.bg, color: cs.color, fontSize: '9px', fontWeight: 700, padding: '2px 7px', borderRadius: '10px', whiteSpace: 'nowrap', marginTop: '1px' }}>{fwId.replace('-', ' ')}</span>
                  <span style={{ fontSize: '11px', color: '#475569', lineHeight: 1.5 }}>{fw.keyRequirement || '—'}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CoverageMatrix({ results, selectedFrameworks }) {
  const [expandedDomain, setExpandedDomain] = useState(null);

  function toggleDomain(domainId) {
    setExpandedDomain(prev => prev === domainId ? null : domainId);
  }

  return (
    <div className="card">
      <div className="step-label">Step 3 of 5 — Harmonisation results</div>
      <h2 className="step-title" style={{ marginBottom: '4px' }}>Coverage matrix</h2>
      <p className="step-sub" style={{ marginBottom: '16px' }}>
        How each control domain is addressed across your selected frameworks.{' '}
        <span style={{ color: '#0F766E', fontWeight: 500 }}>Click any row to see implementation guidance and key requirements.</span>
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table className="matrix-table">
          <thead>
            <tr>
              <th className="matrix-th-domain">Control domain</th>
              {selectedFrameworks.map(f => <th key={f} className="matrix-th">{f.replace('-', ' ')}</th>)}
              <th className="matrix-th">Effort</th>
              <th className="matrix-th" style={{ width: '28px' }} />
            </tr>
          </thead>
          <tbody>
            {results.map(domain => {
              const isExpanded = expandedDomain === domain.domainId;
              return (
                <>
                  <tr
                    key={domain.domainId}
                    className="matrix-row"
                    onClick={() => toggleDomain(domain.domainId)}
                    style={{ cursor: 'pointer', background: isExpanded ? '#F0FDFA' : undefined, transition: 'background .15s' }}
                  >
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
                    <td className="matrix-td-cov" style={{ color: '#94A3B8', fontSize: '12px', paddingRight: '8px' }}>
                      {isExpanded ? '▲' : '▼'}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${domain.domainId}-detail`}>
                      <td colSpan={selectedFrameworks.length + 3} style={{ padding: 0 }}>
                        <DomainDetail domain={domain} selectedFrameworks={selectedFrameworks} />
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="legend-row">
        {Object.entries(COV_STYLE).filter(([k]) => k !== 'unknown').map(([k, v]) => (
          <span key={k} className="legend-item">
            <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: v.bg, border: `1px solid ${v.color}`, display: 'inline-block' }} />
            {v.label}
          </span>
        ))}
      </div>
    </div>
  );
}

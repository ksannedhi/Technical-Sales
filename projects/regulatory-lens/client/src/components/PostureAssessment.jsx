import { useState } from 'react';

const POSTURE_OPTS = [
  { value: 'full',           label: 'Fully implemented',    color: '#3B6D11' },
  { value: 'partial',        label: 'Partially implemented', color: '#BA7517' },
  { value: 'not-implemented',label: 'Not implemented',       color: '#E24B4A' },
];

export default function PostureAssessment({ results, onSubmit, onBack, initialPosture }) {
  const [posture, setPosture] = useState(initialPosture || {});
  const [loading, setLoading] = useState(false);

  function setDomainPosture(domainId, value) {
    setPosture(prev => ({ ...prev, [domainId]: value }));
  }

  async function handleSubmit() {
    setLoading(true);
    await onSubmit(posture);
    setLoading(false);
  }

  const ratedCount = Object.keys(posture).length;

  return (
    <div className="card">
      <div className="step-label">Step 4 of 5 — Posture self-assessment</div>
      <h2 className="step-title">Rate your current implementation</h2>
      <p className="step-sub">For each control domain, rate your organisation's current implementation status. This makes the roadmap specific to your actual gaps.</p>

      <div className="posture-list">
        {results.map(domain => (
          <div key={domain.domainId} className="posture-row">
            <div className="posture-domain">
              <div className="domain-name">{domain.domainLabel}</div>
              <div className="domain-desc">{domain.description}</div>
            </div>
            <div className="posture-opts">
              {POSTURE_OPTS.map(opt => (
                <button
                  key={opt.value}
                  className={`posture-btn ${posture[domain.domainId]===opt.value?'posture-btn-active':''}`}
                  style={posture[domain.domainId]===opt.value ? { borderColor: opt.color, color: opt.color, background: opt.color+'15' } : {}}
                  onClick={() => setDomainPosture(domain.domainId, opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button className="btn" onClick={onBack}>← Back to matrix</button>
          <span style={{ fontSize: '12px', color: ratedCount === results.length ? '#3B6D11' : '#888' }}>
            {ratedCount} of {results.length} domains rated
            {ratedCount < results.length && ` — rate all ${results.length} to continue`}
          </span>
        </div>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={loading || ratedCount < results.length}>
          {loading ? 'Generating roadmap…' : 'Generate implementation roadmap →'}
        </button>
      </div>
    </div>
  );
}

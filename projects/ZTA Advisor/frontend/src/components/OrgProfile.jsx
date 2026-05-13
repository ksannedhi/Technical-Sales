import { useState, useEffect } from 'react';

const INDUSTRY_OPTIONS = [
  'Financial Services', 'Healthcare', 'Government / Public Sector', 'Defense / DoD',
  'Energy & Utilities', 'Retail & E-commerce', 'Technology', 'Manufacturing',
  'Education', 'Telecommunications', 'Legal & Professional Services', 'Other'
];

const SIZE_OPTIONS = [
  '1–500 employees', '501–2,000 employees', '2,001–10,000 employees', '10,000+ employees'
];

export default function OrgProfile({ onComplete }) {
  const [form, setForm] = useState({ orgName: '', industry: '', orgSize: '', geo: '' });
  const [suggested, setSuggested] = useState([]);
  const [allFrameworks, setAllFrameworks] = useState([]);
  const [selectedFrameworks, setSelectedFrameworks] = useState([]);
  const [geoOptions, setGeoOptions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/frameworks')
      .then(r => r.json())
      .then(d => {
        setAllFrameworks(d.frameworks || []);
        setGeoOptions(d.geoOptions || []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!form.geo) { setSuggested([]); return; }
    fetch(`/api/frameworks/suggest?geo=${encodeURIComponent(form.geo)}`)
      .then(r => r.json())
      .then(d => {
        setSuggested(d.suggested || []);
        setSelectedFrameworks((d.suggested || []).map(f => f.id));
      })
      .catch(() => {});
  }, [form.geo]);

  function set(field, val) {
    setForm(f => ({ ...f, [field]: val }));
  }

  function toggleFramework(id) {
    setSelectedFrameworks(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  const canProceed = form.orgName.trim() && form.industry && form.orgSize && form.geo && selectedFrameworks.length > 0;

  function handleStart() {
    if (!canProceed) return;
    onComplete(form, selectedFrameworks);
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)' }}>Organization Profile</h2>
        <p className="text-muted mt-4">
          Provide basic details about the organization. This context shapes the framework recommendation and final report.
        </p>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">Organization Details</div>
        <div className="form-grid">
          <div className="form-group full">
            <label>Organization Name</label>
            <input
              type="text"
              placeholder="e.g. Acme Corp"
              value={form.orgName}
              onChange={e => set('orgName', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Industry</label>
            <select value={form.industry} onChange={e => set('industry', e.target.value)}>
              <option value="">Select industry…</option>
              {INDUSTRY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Organization Size</label>
            <select value={form.orgSize} onChange={e => set('orgSize', e.target.value)}>
              <option value="">Select size…</option>
              {SIZE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="form-group full">
            <label>Geography / Primary Operating Region</label>
            <select value={form.geo} onChange={e => set('geo', e.target.value)}>
              <option value="">Select geography…</option>
              {geoOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          ZTA Framework Selection
          {form.geo && suggested.length > 0 && (
            <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)', marginLeft: 8 }}>
              — recommended based on your region
            </span>
          )}
        </div>

        {!form.geo && (
          <div className="alert-info">
            Select a geography above to get framework recommendations, then adjust as needed.
          </div>
        )}

        <div className="framework-grid">
          {allFrameworks.map(f => {
            const isSuggested = suggested.some(s => s.id === f.id);
            const isSelected = selectedFrameworks.includes(f.id);
            return (
              <button
                key={f.id}
                className={`framework-chip ${isSelected ? 'selected' : ''}`}
                onClick={() => toggleFramework(f.id)}
                type="button"
              >
                <div className="framework-chip-name">
                  {f.shortName}
                  {isSuggested && <span className="suggest-badge">Suggested</span>}
                </div>
                <div className="framework-chip-version">{f.name}</div>
              </button>
            );
          })}
        </div>

        {selectedFrameworks.length > 0 && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--muted)' }}>
            {selectedFrameworks.length} framework{selectedFrameworks.length !== 1 ? 's' : ''} selected — the assessment will be mapped to all selected frameworks.
          </div>
        )}
      </div>

      <div className="actions-row">
        <span className="text-muted text-sm">
          {!canProceed ? 'Complete all fields and select at least one framework to continue.' : 'Ready to begin the assessment.'}
        </span>
        <button
          className="btn btn-primary"
          onClick={handleStart}
          disabled={!canProceed || loading}
        >
          {loading ? <span className="spinner" /> : null}
          Begin Assessment →
        </button>
      </div>
    </div>
  );
}

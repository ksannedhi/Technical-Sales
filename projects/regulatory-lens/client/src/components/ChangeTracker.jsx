import { useState } from 'react';

export default function ChangeTracker({ onGoToHarmoniser }) {
  const [mode,         setMode]         = useState('description'); // 'documents' | 'description'
  const [frameworkName,setFrameworkName]= useState('');
  const [description,  setDescription] = useState('');
  const [oldFile,      setOldFile]      = useState(null);
  const [newFile,      setNewFile]      = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [result,       setResult]       = useState(null);
  const [error,        setError]        = useState(null);

  async function handleAnalyse() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      let res;
      if (mode === 'documents') {
        if (!oldFile || !newFile) throw new Error('Please upload both PDF files');
        const form = new FormData();
        form.append('oldVersion', oldFile);
        form.append('newVersion', newFile);
        form.append('frameworkName', frameworkName || 'Unknown Framework');
        res = await fetch('/api/change-tracker/documents', { method: 'POST', body: form });
      } else {
        if (!description.trim()) throw new Error('Please describe the change');
        res = await fetch('/api/change-tracker/description', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description, frameworkName: frameworkName || 'Unknown Framework' })
        });
      }
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  const IMPACT_COLOR  = { 'new-technology': '#E24B4A', 'config-change': '#D85A30', 'process-change': '#BA7517', 'policy-change': '#3B6D11', 'no-action': '#888' };
  const URGENCY_COLOR = { immediate: '#E24B4A', 'next-review-cycle': '#BA7517', monitor: '#3B6D11' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="card" style={{ maxWidth: '640px' }}>
        <h2 className="step-title">Regulatory change tracker</h2>
        <p className="step-sub">Assess the impact of a framework update on your compliance posture.</p>

        <div className="field">
          <label className="field-label">Framework name</label>
          <input type="text" placeholder="e.g. NCA ECC, SAMA CSF" value={frameworkName} onChange={e=>setFrameworkName(e.target.value)} style={{ width: '100%' }} />
        </div>

        <div className="field">
          <label className="field-label">Input method</label>
          <div className="chip-row">
            <button className={`chip ${mode==='description'?'chip-active':''}`} onClick={()=>setMode('description')}>Describe the change</button>
            <button className={`chip ${mode==='documents'?'chip-active':''}`} onClick={()=>setMode('documents')}>Upload PDFs</button>
          </div>
        </div>

        {mode === 'description' && (
          <div className="field">
            <label className="field-label">Describe the regulatory change</label>
            <textarea
              rows={4}
              placeholder="e.g. NCA has updated Domain 2 to require MFA on all privileged accounts within 90 days…"
              value={description}
              onChange={e=>setDescription(e.target.value)}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>
        )}

        {mode === 'documents' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="field">
              <label className="field-label">Old version PDF</label>
              <input type="file" accept=".pdf" onChange={e=>setOldFile(e.target.files[0])} />
              {oldFile && <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>{oldFile.name}</div>}
            </div>
            <div className="field">
              <label className="field-label">New version PDF</label>
              <input type="file" accept=".pdf" onChange={e=>setNewFile(e.target.files[0])} />
              {newFile && <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>{newFile.name}</div>}
            </div>
          </div>
        )}

        <button className="btn btn-primary" onClick={handleAnalyse} disabled={loading} style={{ marginTop: '8px' }}>
          {loading ? 'Analysing…' : 'Analyse impact'}
        </button>
        {error && <p style={{ color: '#A32D2D', fontSize: '12px', marginTop: '8px' }}>{error}</p>}
      </div>

      {result && (
        <div className="card">
          <h2 className="step-title" style={{ marginBottom: '4px' }}>{result.frameworkName || frameworkName} — Change impact</h2>
          <p className="step-sub" style={{ marginBottom: '14px' }}>{result.changesSummary}</p>

          {(result.changes||[]).map((c, i) => (
            <div key={i} className="roadmap-row">
              <div className="roadmap-body">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                  <span className="domain-name">{c.description}</span>
                  <span style={{ background: (IMPACT_COLOR[c.implementationImpact]||'#888')+'20', color: IMPACT_COLOR[c.implementationImpact]||'#888', fontSize: '10px', fontWeight: 500, padding: '2px 8px', borderRadius: '20px' }}>{c.implementationImpact}</span>
                  <span style={{ background: (URGENCY_COLOR[c.urgency]||'#888')+'20', color: URGENCY_COLOR[c.urgency]||'#888', fontSize: '10px', fontWeight: 500, padding: '2px 8px', borderRadius: '20px' }}>{c.urgency}</span>
                </div>
                <div style={{ fontSize: '11px', color: '#888' }}>Domain: {c.domainId} · Ref: {c.controlReference || '—'} · Type: {c.type}</div>
              </div>
            </div>
          ))}

          {(result.staleAssessments||[]).length > 0 && (
            <div style={{ marginTop: '14px', padding: '10px 14px', background: '#FFF4ED', borderLeft: '3px solid #D85A30', borderRadius: '0 4px 4px 0' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#993C1D', marginBottom: '4px' }}>Re-harmonisation recommended for these domains:</div>
              <div style={{ fontSize: '11px', color: '#993C1D' }}>{result.staleAssessments.join(', ')}</div>
            </div>
          )}

          {/* Ingest callout — shown when new doc added or re-harmonisation needed */}
          {((result.staleAssessments||[]).length > 0 || (result.changes||[]).some(c => c.type === 'added')) && (
            <div style={{ marginTop: '14px', padding: '12px 14px', background: '#F0FDFA', border: '1px solid #99F6E4', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#0F766E', marginBottom: '4px' }}>
                  Is this framework new to your compliance scope?
                </div>
                <div style={{ fontSize: '11px', color: '#555', lineHeight: 1.6 }}>
                  If you have the PDF, upload it in the Harmoniser as a custom framework. Claude will extract its controls,
                  map them to the domain taxonomy, and include it in your next coverage matrix and roadmap — giving you a
                  full gap analysis against your existing frameworks.
                </div>
              </div>
              {onGoToHarmoniser && (
                <button
                  className="btn btn-primary"
                  style={{ whiteSpace: 'nowrap', flexShrink: 0, fontSize: '12px', padding: '8px 14px' }}
                  onClick={onGoToHarmoniser}
                >
                  Upload in Harmoniser →
                </button>
              )}
            </div>
          )}

          {(result.recommendedActions||[]).length > 0 && (
            <div style={{ marginTop: '14px' }}>
              <div className="field-label" style={{ marginBottom: '8px' }}>Recommended actions</div>
              {result.recommendedActions.map((a,i) => (
                <div key={i} style={{ fontSize: '12px', color: '#555', marginTop: '5px', paddingLeft: '10px', borderLeft: '2px solid #E5E5E5' }}>{a}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

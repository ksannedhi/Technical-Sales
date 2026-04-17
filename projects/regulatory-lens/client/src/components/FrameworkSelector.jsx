import { useState } from 'react';

const COVERAGE_STYLE = {
  'full':          { bg: '#E1F5EE', color: '#0F6E56', label: 'Full' },
  'partial':       { bg: '#FAEEDA', color: '#633806', label: 'Partial' },
  'not-addressed': { bg: '#F5F5F5', color: '#999',    label: 'Not addressed' },
};

function ExtractionPreview({ framework }) {
  const [open, setOpen] = useState(false);
  const domainMap = framework.domainControlMap || {};
  const mapped    = Object.entries(domainMap).filter(([, v]) => v.coverage !== 'not-addressed');
  const total     = Object.keys(domainMap).length;

  return (
    <div style={{ marginTop: '10px', border: '1px solid #E2E8F0', borderRadius: '6px', overflow: 'hidden' }}>
      {framework.truncated && (
        <div style={{ fontSize: '11px', color: '#92400E', background: '#FFFBEB', borderBottom: '1px solid #FDE68A', padding: '5px 12px' }}>
          ⚠ Document truncated — only the first 12,000 of {framework.rawTextLength?.toLocaleString()} characters were analysed. Controls in later sections may be missing from this extraction.
        </div>
      )}
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', textAlign: 'left', background: '#F8FAFC', padding: '8px 12px',
          border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <span style={{ fontSize: '11px', fontWeight: 600, color: '#0F766E' }}>
          Extraction preview — {mapped.length} of {total} domains mapped
        </span>
        <span style={{ fontSize: '11px', color: '#888' }}>{open ? '▲ Hide' : '▼ Show'}</span>
      </button>

      {open && (
        <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
          {Object.entries(domainMap).map(([domainId, v]) => {
            const style = COVERAGE_STYLE[v.coverage] || COVERAGE_STYLE['not-addressed'];
            return (
              <div key={domainId} style={{ padding: '8px 12px', borderTop: '1px solid #F0F0F0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 500, color: '#333' }}>{domainId}</span>
                  <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 7px', borderRadius: '10px',
                    background: style.bg, color: style.color }}>{style.label}</span>
                  {(v.controlIds||[]).length > 0 && (
                    <span style={{ fontSize: '10px', color: '#888' }}>
                      Controls: {v.controlIds.join(', ')}
                    </span>
                  )}
                </div>
                {v.controlText && v.coverage !== 'not-addressed' && (
                  <div style={{ fontSize: '11px', color: '#555', lineHeight: 1.5 }}>{v.controlText}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const ALL_FRAMEWORKS = [
  { id: 'NCA-ECC',   label: 'NCA ECC 2024',             jurisdiction: 'Saudi Arabia' },
  { id: 'SAMA-CSF',  label: 'SAMA CSF',                  jurisdiction: 'Saudi Arabia · Banking' },
  { id: 'CBK',       label: 'CBK Framework',             jurisdiction: 'Kuwait · Banking' },
  { id: 'ISO-27001', label: 'ISO 27001:2022',            jurisdiction: 'International' },
  { id: 'NIST-CSF',  label: 'NIST CSF 2.0',             jurisdiction: 'International' },
  { id: 'UAE-NIAF',  label: 'UAE NIAF',                  jurisdiction: 'UAE' },
  { id: 'PDPL-UAE',  label: 'UAE PDPL (DL 45/2021)',    jurisdiction: 'UAE · Personal data' },
  { id: 'PDPL-QAT',  label: 'Qatar PDPL (Law 13/2016)', jurisdiction: 'Qatar · Personal data' },
  { id: 'PCI-DSS',   label: 'PCI DSS 4.0.1',            jurisdiction: 'International · Payments' },
  { id: 'IEC-62443', label: 'IEC 62443',                 jurisdiction: 'International · OT/ICS' },
  { id: 'SOC2',      label: 'SOC 2',                     jurisdiction: 'International · SaaS' },
  { id: 'QATAR-NIAS', label: 'Qatar NIAS V2.1',          jurisdiction: 'Qatar' },
];

const WEIGHT_OPTS = ['mandatory', 'contractual', 'voluntary'];

export default function FrameworkSelector({ recommended, initialSelected, initialWeights, onStart, onBack }) {
  const [selected,    setSelected]    = useState(initialSelected || []);
  const [weights,     setWeights]     = useState(initialWeights  || {});
  const [customFWs,   setCustomFWs]   = useState([]);
  const [uploadFile,  setUploadFile]  = useState(null);
  const [uploadName,  setUploadName]  = useState('');
  const [uploading,   setUploading]   = useState(false);
  const [uploadError, setUploadError] = useState(null);

  function toggleFw(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  function setWeight(id, w) {
    setWeights(prev => ({ ...prev, [id]: w }));
  }

  async function handleUpload() {
    if (!uploadFile) return;
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append('frameworkPDF', uploadFile);
      if (uploadName.trim()) form.append('frameworkName', uploadName.trim());

      const res  = await fetch('/api/frameworks/custom', { method: 'POST', body: form });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Upload failed');
      }
      const data = await res.json();

      setCustomFWs(prev => [...prev, {
        ...data,
        rawData: data  // keep full response including domainControlMap for extraction preview
      }]);
      setSelected(prev => [...prev, data.frameworkId]);
      setWeights(prev => ({ ...prev, [data.frameworkId]: 'contractual' }));
      setUploadFile(null);
      setUploadName('');
    } catch (e) {
      setUploadError(e.message);
    }
    setUploading(false);
  }

  function removeCustomFw(frameworkId) {
    setCustomFWs(prev => prev.filter(f => f.frameworkId !== frameworkId));
    setSelected(prev => prev.filter(id => id !== frameworkId));
    setWeights(prev => { const w = { ...prev }; delete w[frameworkId]; return w; });
    fetch(`/api/frameworks/custom/${frameworkId}`, { method: 'DELETE' }).catch(() => {});
  }

  const recIds       = (recommended || []).map(r => r.frameworkId);
  const allDisplayed = [
    ...ALL_FRAMEWORKS,
    ...customFWs.map(f => ({
      id:           f.frameworkId,
      label:        f.name,
      jurisdiction: [...(f.jurisdiction || []), ...(f.sector || [])].join(' · ') || 'Custom',
      isCustom:     true,
      summary:      f.summary,
      rawData:      f.rawData
    }))
  ];

  return (
    <div className="card">
      <div className="step-label">Step 2 of 5 — Framework selection</div>
      <h2 className="step-title">Select active frameworks</h2>
      <p className="step-sub">Recommended frameworks are pre-selected. Adjust as needed, then assign regulatory weight.</p>

      {recommended?.length > 0 && (
        <div className="disclaimer-box" style={{ marginBottom: '16px' }}>
          <p style={{ fontWeight: 600, marginBottom: '8px' }}>
            {recommended.length} framework{recommended.length !== 1 ? 's' : ''} recommended for your profile:
          </p>
          <ul style={{ margin: '0 0 8px 0', paddingLeft: '18px', lineHeight: 1.6 }}>
            {recommended.map(r => (
              <li key={r.frameworkId} style={{ marginBottom: '4px' }}>
                <span style={{ fontWeight: 500 }}>{r.frameworkId}</span>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', marginLeft: '6px',
                  background: r.weight === 'mandatory' ? '#FEE2E2' : r.weight === 'contractual' ? '#FEF9C3' : '#F0FDF4',
                  color: r.weight === 'mandatory' ? '#991B1B' : r.weight === 'contractual' ? '#854D0E' : '#166534',
                  padding: '1px 6px', borderRadius: '4px' }}>
                  {r.weight}
                </span>
                {r.rationale && <span style={{ fontSize: '12px', color: '#555', marginLeft: '6px' }}>— {r.rationale}</span>}
              </li>
            ))}
          </ul>
          <p style={{ fontStyle: 'italic', fontSize: '11px', color: '#888', margin: 0 }}>
            {recommended.find(r => r.regulatoryBasis) ? '' : ''}
            Verify all regulatory obligations with your legal and compliance team before relying on these recommendations.
          </p>
        </div>
      )}

      <div className="fw-list">
        {allDisplayed.map(fw => {
          const isSelected = selected.includes(fw.id);
          const isRec      = recIds.includes(fw.id);
          const recItem    = recommended?.find(r => r.frameworkId === fw.id);
          return (
            <div key={fw.id} className={`fw-row ${isSelected ? 'fw-row-selected' : ''}`}>
              <label className="fw-check">
                <input type="checkbox" checked={isSelected} onChange={() => toggleFw(fw.id)} />
                <div className="fw-info">
                  <div className="fw-name">
                    {fw.label}
                    {isRec      && <span className="fw-rec-badge">Recommended</span>}
                    {fw.isCustom && <span className="fw-custom-badge">Custom</span>}
                  </div>
                  <div className="fw-jurisdiction">{fw.jurisdiction}</div>
                  {fw.summary      && <div className="fw-rationale">{fw.summary}</div>}
                  {recItem?.rationale && !fw.isCustom && <div className="fw-rationale">{recItem.rationale}</div>}
                  {fw.isCustom && (
                    <div style={{ fontSize: '11px', color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '5px', padding: '4px 8px', marginTop: '6px' }}>
                      ⚠ Session-only — this framework will be cleared if the server restarts. Re-upload to restore it.
                    </div>
                  )}
                  {fw.isCustom && fw.rawData && <ExtractionPreview framework={fw.rawData} />}
                  {isSelected && (
                    <div className="fw-weight">
                      {WEIGHT_OPTS.map(w => (
                        <button key={w}
                          className={`chip chip-sm ${(weights[fw.id] || 'voluntary') === w ? 'chip-active' : ''}`}
                          onClick={() => setWeight(fw.id, w)}>{w}</button>
                      ))}
                    </div>
                  )}
                </div>
              </label>
              {fw.isCustom && (
                <button onClick={() => removeCustomFw(fw.id)}
                  style={{ fontSize: '11px', color: '#A32D2D', background: 'none', border: 'none', cursor: 'pointer', padding: '4px', flexShrink: 0 }}>
                  Remove
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Custom framework upload */}
      <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
        <div className="field-label" style={{ marginBottom: '10px' }}>Upload a custom framework</div>
        <p style={{ fontSize: '12px', color: '#888', marginBottom: '8px', lineHeight: 1.55 }}>
          Have a framework not listed above — such as a sector-specific circular, internal standard, or
          a national framework we haven't pre-loaded? Upload the PDF and Claude will extract its
          controls and map them to the domain taxonomy automatically.
        </p>
        <p style={{ fontSize: '11px', color: '#A07000', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '6px', padding: '7px 10px', marginBottom: '12px', lineHeight: 1.6 }}>
          <strong>Already built in — do not re-upload:</strong> NCA-ECC, SAMA-CSF, CBK, ISO 27001, NIST CSF, UAE NIAF, PCI-DSS, IEC-62443, SOC 2, PDPL-UAE, PDPL-QAT.
          Uploading a duplicate will create a conflicting second column in the matrix.
        </p>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1', minWidth: '180px' }}>
            <div className="field-label" style={{ marginBottom: '4px' }}>Framework name (optional)</div>
            <input
              type="text"
              placeholder="e.g. Saudi PDPL, NESA IAR v2…"
              value={uploadName}
              onChange={e => setUploadName(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ flex: '1', minWidth: '180px' }}>
            <div className="field-label" style={{ marginBottom: '4px' }}>Framework PDF</div>
            <input
              type="file"
              accept=".pdf"
              onChange={e => { setUploadFile(e.target.files[0]); setUploadError(null); }}
            />
            {uploadFile && (
              <div style={{ fontSize: '11px', color: '#888', marginTop: '3px' }}>{uploadFile.name}</div>
            )}
          </div>
          <button
            className="btn btn-primary"
            onClick={handleUpload}
            disabled={!uploadFile || uploading}
            style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            {uploading ? 'Analysing PDF…' : 'Upload and analyse'}
          </button>
        </div>

        {uploading && (
          <div style={{ fontSize: '12px', color: '#888', marginTop: '10px' }}>
            Claude is reading the document and mapping controls to the taxonomy — this takes 15–30 seconds…
          </div>
        )}
        {uploadError && (
          <div style={{ fontSize: '12px', color: '#A32D2D', marginTop: '8px' }}>{uploadError}</div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
        <button className="btn" onClick={onBack}>← Back to intake</button>
        <button
          className="btn btn-primary"
          disabled={selected.length < 2}
          onClick={() => onStart(selected, weights)}
        >
          Start harmonisation ({selected.length} frameworks) →
        </button>
      </div>
    </div>
  );
}

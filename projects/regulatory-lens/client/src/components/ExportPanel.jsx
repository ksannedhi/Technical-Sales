import { useState } from 'react';

export default function ExportPanel({ harmonisationResults, roadmap, selectedFrameworks, frameworkWeights }) {
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPDF,   setExportingPDF]   = useState(false);

  async function exportExcel() {
    setExportingExcel(true);
    try {
      const res  = await fetch('/api/export/excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ harmonisationResults, selectedFrameworks, frameworkWeights })
      });
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = `harmonisation-matrix-${new Date().toISOString().slice(0,10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { alert(e.message); }
    setExportingExcel(false);
  }

  async function exportPDF() {
    setExportingPDF(true);
    try {
      const res  = await fetch('/api/export/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ harmonisationResults, roadmap, selectedFrameworks })
      });
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = `harmonisation-report-${new Date().toISOString().slice(0,10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { alert(e.message); }
    setExportingPDF(false);
  }

  return (
    <div className="card">
      <div className="step-label">Exports</div>
      <h2 className="step-title">Download reports</h2>
      <p style={{ fontSize: '13px', color: '#64748B', marginBottom: '16px', lineHeight: 1.6 }}>
        Choose the format that fits your audience. Both reports reflect the same analysis session.
      </p>

      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>

        {/* Excel card */}
        <div style={{ flex: 1, minWidth: '240px', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '16px 18px', background: '#F8FAFC' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <span style={{ fontSize: '20px' }}>📊</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>Excel matrix</span>
            <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#64748B', background: '#E2E8F0', padding: '2px 7px', borderRadius: '10px' }}>.xlsx</span>
          </div>
          <ul style={{ fontSize: '11px', color: '#475569', lineHeight: 1.8, paddingLeft: '14px', marginBottom: '14px' }}>
            <li><strong>Sheet 1 — Coverage matrix</strong>: all {harmonisationResults?.length || 23} domains × each framework, colour-coded Full / Partial / Not addressed, with effort column</li>
            <li><strong>Sheet 2 — Key requirements</strong>: one row per domain/framework pair — weight, coverage level, key requirement text, and most demanding framework flag</li>
          </ul>
          <p style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '14px', fontStyle: 'italic' }}>
            Best for compliance officers and working teams who need to filter, sort, and annotate gaps.
          </p>
          <button className="btn" style={{ width: '100%' }} onClick={exportExcel} disabled={exportingExcel}>
            {exportingExcel ? 'Generating…' : 'Download Excel matrix'}
          </button>
        </div>

        {/* PDF card */}
        <div style={{ flex: 1, minWidth: '240px', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '16px 18px', background: '#F8FAFC' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <span style={{ fontSize: '20px' }}>📄</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>PDF report</span>
            <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#64748B', background: '#E2E8F0', padding: '2px 7px', borderRadius: '10px' }}>.pdf · landscape A4</span>
          </div>
          <ul style={{ fontSize: '11px', color: '#475569', lineHeight: 1.8, paddingLeft: '14px', marginBottom: '14px' }}>
            <li><strong>Executive summary</strong>: overall posture narrative with critical and total gap counts</li>
            <li><strong>Coverage matrix</strong>: the full domain × framework grid</li>
            <li><strong>Roadmap — immediate &amp; short-term</strong>: full detail per item (actions, quick wins, mandatory gaps, effort, score)</li>
            <li><strong>Roadmap — medium-term &amp; planned</strong>: compact summary table</li>
          </ul>
          <p style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '14px', fontStyle: 'italic' }}>
            Best for CISO briefings, board presentations, and sharing with stakeholders who don't need the raw data.
          </p>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={exportPDF} disabled={exportingPDF}>
            {exportingPDF ? 'Generating…' : 'Download PDF report'}
          </button>
        </div>

      </div>
    </div>
  );
}

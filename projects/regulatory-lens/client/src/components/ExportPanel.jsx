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
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
      <button className="btn" onClick={exportExcel} disabled={exportingExcel}>
        {exportingExcel ? 'Generating…' : 'Export Excel matrix'}
      </button>
      <button className="btn btn-primary" onClick={exportPDF} disabled={exportingPDF}>
        {exportingPDF ? 'Generating…' : 'Export PDF report'}
      </button>
    </div>
  );
}

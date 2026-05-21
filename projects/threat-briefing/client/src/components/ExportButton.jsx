import { useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export default function ExportButton({ briefing }) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch(`${API_BASE}/api/briefing/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ briefing })
      });
      if (!res.ok) throw new Error('Export failed — check server logs.');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `threat-briefing-${new Date().toISOString().slice(0,10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e instanceof TypeError
        ? 'Backend not reachable — make sure the server is running.'
        : e.message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
      {exportError && <p className="error-msg" style={{ margin: 0 }}>{exportError}</p>}
      <button className="btn btn-primary" onClick={handleExport} disabled={exporting}>
        {exporting ? 'Generating PDF…' : 'Export PDF report'}
      </button>
    </div>
  );
}

import { useState } from 'react';

export default function ExportButton({ briefing }) {
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch('/api/briefing/export', {
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
      const msg = e instanceof TypeError
        ? 'Export failed — backend is not reachable. Make sure the server is running on port 3003.'
        : e.message;
      alert(msg);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <button className="btn btn-primary" onClick={handleExport} disabled={exporting}>
        {exporting ? 'Generating PDF…' : 'Export PDF report'}
      </button>
    </div>
  );
}

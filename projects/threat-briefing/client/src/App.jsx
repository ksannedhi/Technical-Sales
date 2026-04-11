import { useState, useEffect, useCallback } from 'react';
import BriefingHeader   from './components/BriefingHeader.jsx';
import ThreatBanner     from './components/ThreatBanner.jsx';
import StatsRow         from './components/StatsRow.jsx';
import ExecutiveSummary from './components/ExecutiveSummary.jsx';
import TopThreats       from './components/TopThreats.jsx';
import CisaKEV          from './components/CisaKEV.jsx';
import Recommendations  from './components/Recommendations.jsx';
import ExportButton     from './components/ExportButton.jsx';

export default function App() {
  const [briefing,   setBriefing]   = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error,      setError]      = useState(null);

  const fetchLatest = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch('/api/briefing/latest');
      if (!res.ok) throw new Error('No briefing available yet. Click "Generate now" to create one.');
      const data = await res.json();
      setBriefing(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const res  = await fetch('/api/briefing/generate', { method: 'POST' });
      if (!res.ok) throw new Error('Generation failed — check server logs.');
      const data = await res.json();
      setBriefing(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  }, []);

  useEffect(() => { fetchLatest(); }, [fetchLatest]);

  if (loading) return (
    <div className="state-center">
      <div className="spinner" />
      <span>Loading latest briefing…</span>
    </div>
  );

  return (
    <div className="shell">
      <BriefingHeader
        briefing={briefing}
        generating={generating}
        onGenerate={generate}
        onRefresh={fetchLatest}
      />

      {error && <p className="error-msg">{error}</p>}

      {briefing && <>
        <ThreatBanner briefing={briefing} />
        <StatsRow briefing={briefing} />

        <div className="two-col">
          <ExecutiveSummary briefing={briefing} />
          <TopThreats briefing={briefing} />
        </div>

        <div className="two-col">
          <CisaKEV briefing={briefing} />
          <Recommendations briefing={briefing} />
        </div>

        <ExportButton briefing={briefing} />
      </>}

      {!briefing && !error && (
        <div className="state-center">
          <p>No briefing found. Generate one to get started.</p>
          <button className="btn btn-primary" onClick={generate} disabled={generating}>
            {generating ? 'Generating…' : 'Generate now'}
          </button>
        </div>
      )}
    </div>
  );
}

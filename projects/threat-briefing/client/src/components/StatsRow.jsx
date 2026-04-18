export default function StatsRow({ briefing }) {
  const s = briefing.feedStats || {};
  const gccHigh = (briefing.topThreats || [])
    .filter(t => t.gccRelevance === 'high').length;

  return (
    <div className="stats-row">
      <div className="stat-card">
        <div className="stat-label">OTX pulses</div>
        <div className="stat-val">{s.otxPulsesProcessed ?? '—'}</div>
        <div className="stat-sub">processed today</div>
      </div>
      <div className="stat-card">
        <div className="stat-label">CISA KEV added</div>
        <div className="stat-val">{s.cisaKEVAdded ?? '—'}</div>
        <div className="stat-sub">new entries</div>
      </div>
      <div className="stat-card">
        <div className="stat-label">Malware samples</div>
        <div className="stat-val">{s.malwareSamplesAnalysed ?? '—'}</div>
        <div className={`stat-sub${briefing.abusechUnavailable ? ' stat-sub-warn' : ''}`}>
          {briefing.abusechUnavailable ? 'feed unavailable' : 'MalwareBazaar'}
        </div>
      </div>
      <div className="stat-card">
        <div className="stat-label">GCC relevance</div>
        <div className="stat-val">{gccHigh}</div>
        <div className="stat-sub">high-priority signals</div>
      </div>
    </div>
  );
}

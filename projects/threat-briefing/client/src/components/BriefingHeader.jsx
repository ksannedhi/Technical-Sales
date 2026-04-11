export default function BriefingHeader({ briefing, generating, onGenerate, onRefresh }) {
  const dateStr = briefing
    ? new Date(briefing.briefingDate || Date.now()).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
      })
    : '—';

  return (
    <div className="topbar">
      <div className="brand">
        <div className="live-dot" />
        <span className="brand-name">Threat Intel Briefing</span>
        <span className="brand-meta">{dateStr}</span>
      </div>
      <div className="topbar-actions">
        <button className="btn" onClick={onRefresh}>Refresh</button>
        <button className="btn btn-primary" onClick={onGenerate} disabled={generating}>
          {generating ? 'Generating…' : 'Generate now'}
        </button>
      </div>
    </div>
  );
}

export default function ThreatBanner({ briefing }) {
  const level = briefing.threatLevel || 'medium';
  return (
    <div className={`threat-banner ${level}`}>
      <div className={`threat-level-badge ${level}`}>
        <span className="badge-label">Threat</span>
        <span className="badge-val">{level}</span>
      </div>
      <div className="banner-text">
        <p>Today's regional threat level: {level.charAt(0).toUpperCase() + level.slice(1)}</p>
        <p>{briefing.executiveSummary}</p>
      </div>
    </div>
  );
}

export default function TopThreats({ briefing }) {
  const threats = briefing.topThreats || [];

  return (
    <div className="card">
      <div className="card-heading">Top threats ({threats.length})</div>
      {threats.map(t => (
        <div key={t.rank} className="threat-row">
          <span className="threat-rank">{t.rank}</span>
          <div className="threat-body">
            <div className="threat-title">{t.title}</div>
            <div className="threat-desc">{t.description}</div>
            {t.businessImpact && (
              <div className="threat-impact">{t.businessImpact}</div>
            )}
            <div className="tags">
              <span className={`tag tag-${t.severity}`}>{t.severity}</span>
              {t.gccRelevance === 'high' && (
                <span className="tag tag-gcc">GCC: High</span>
              )}
              {(t.attackTactics || []).map(tac => (
                <span key={tac} className="tag tag-tactic">{tac}</span>
              ))}
              {(t.affectedSectors || []).map(sec => (
                <span key={sec} className="tag tag-sector">{sec}</span>
              ))}
            </div>
            {(t.iocs || []).length > 0 && (
              <div className="iocs">
                {t.iocs.slice(0, 4).map(ioc => (
                  <span key={ioc} className="ioc">{ioc}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

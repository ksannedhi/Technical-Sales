const OWNER_PILL = { SOC: 'pill-soc', IT: 'pill-it', Management: 'pill-mgmt' };
const TIME_PILL  = { immediate: 'pill-imm', '24h': 'pill-24h', '1-week': 'pill-1week' };

export default function Recommendations({ briefing }) {
  const recs = briefing.recommendations || [];

  return (
    <div className="card">
      <div className="card-heading">Recommended actions</div>
      {recs.length === 0 && (
        <p style={{ fontSize: '12px', color: '#aaa' }}>No recommendations available.</p>
      )}
      {recs.map((r, i) => (
        <div key={i} className="rec-row">
          <div className="rec-text">{r.action}</div>
          <div className="rec-pills">
            <span className={`pill ${OWNER_PILL[r.owner] || 'pill-soc'}`}>{r.owner}</span>
            <span className={`pill ${TIME_PILL[r.timeframe]  || 'pill-1week'}`}>{r.timeframe}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function RecommendationsPanel({ recommendations }) {
  return (
    <section className="panel">
      <div className="panel-heading compact">
        <h2>Recommendations</h2>
      </div>
      <ol className="recommendation-list">
        {recommendations.map((recommendation, index) => (
          <li key={`${recommendation.owner}-${index}`}>
            <div>
              <strong>{recommendation.action}</strong>
              <p>{recommendation.rationale}</p>
            </div>
            <div className="recommendation-meta">
              <span className="owner-chip">{recommendation.owner}</span>
              <span className="time-chip">{recommendation.timeframe}</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default RecommendationsPanel;

const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };

function FindingsPanel({ findings }) {
  const sortedFindings = [...findings].sort((left, right) => severityOrder[left.severity] - severityOrder[right.severity]);

  return (
    <section className="panel findings-panel">
      <div className="panel-heading compact">
        <h2>Findings</h2>
        <span>{sortedFindings.length} indicators</span>
      </div>
      <div className="findings-list">
        {sortedFindings.map((finding) => (
          <article key={finding.id} className="finding-row">
            <div className="finding-meta">
              <span className={`severity-chip severity-${finding.severity}`}>{finding.severity}</span>
              <span className="category-chip">{finding.displayCategory || finding.category.replace('_', ' ')}</span>
            </div>
            <div className="finding-body">
              <h3>{finding.title}</h3>
              <p>{finding.detail}</p>
              {finding.excerpt ? <pre>{finding.excerpt}</pre> : null}
              <div className="finding-footer">
                <span>ECC: {finding.eccControls.join(', ')}</span>
                <span>{finding.deterministic ? 'Deterministic signal' : 'AI-correlated insight'}</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default FindingsPanel;

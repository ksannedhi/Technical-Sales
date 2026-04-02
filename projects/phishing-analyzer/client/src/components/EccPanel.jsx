function EccPanel({ gaps, findings = [] }) {
  const categoriesByControl = new Map();

  findings.forEach((finding) => {
    finding.eccControls.forEach((controlId) => {
      if (!categoriesByControl.has(controlId)) {
        categoriesByControl.set(controlId, new Set());
      }

      categoriesByControl.get(controlId).add(finding.displayCategory || finding.category.replaceAll('_', ' '));
    });
  });

  return (
    <section className="panel">
      <div className="panel-heading compact">
        <h2>NCA ECC Compliance Gaps</h2>
        <span>{gaps.length} controls</span>
      </div>
      <div className="ecc-table">
        <div className="ecc-table-head">
          <span>Finding Category</span>
          <span>NCA ECC Controls Violated</span>
          <span>What The Control Requires</span>
        </div>
        {gaps.map((gap) => (
          <article key={gap.controlId} className="ecc-table-row">
            <div className="ecc-categories">
              {[...(categoriesByControl.get(gap.controlId) || new Set(['General phishing protection']))].map((category) => (
                <span key={`${gap.controlId}-${category}`} className="ecc-category-pill">
                  {category}
                </span>
              ))}
            </div>
            <div>
              <div className="ecc-control-pill">{gap.controlId}</div>
              <div className="muted">{gap.controlName}</div>
            </div>
            <div>
              <div>{gap.whyItMatters}</div>
              <div className="ecc-row-footer">
                <span className="muted">{gap.gap}</span>
                <span className={`priority-chip priority-${gap.priority}`}>{gap.priority}</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default EccPanel;

const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };

const FRAMEWORK_LABEL = {
  nca_ecc: 'NCA ECC',
  iso27001: 'ISO 27001'
};

// Highlight URLs, email addresses, and domain-like strings in excerpts.
const URL_RE = /https?:\/\/[^\s<>"]+/g;
const DOMAIN_RE = /\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z]{2,})+\b/gi;

function HighlightedExcerpt({ text, category }) {
  if (!text) return null;

  // For link-related findings, highlight URLs and domains
  const highlight = category === 'links' || category === 'sender' || category === 'impersonation' || category === 'headers';
  if (!highlight) return <pre>{text}</pre>;

  const parts = [];
  let lastIndex = 0;
  const re = new RegExp(`(${URL_RE.source})|(${DOMAIN_RE.source})`, 'gi');
  let m;

  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      parts.push(text.slice(lastIndex, m.index));
    }
    const isUrl = !!m[1];
    parts.push(
      <mark key={m.index} className={isUrl ? 'excerpt-url' : 'excerpt-domain'}>
        {m[0]}
      </mark>
    );
    lastIndex = m.index + m[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <pre>{parts}</pre>;
}

function FindingsPanel({ findings, framework = 'nca_ecc' }) {
  const sortedFindings = [...findings].sort((l, r) => severityOrder[l.severity] - severityOrder[r.severity]);
  const controlKey = framework === 'iso27001' ? 'isoControls' : 'eccControls';
  const controlLabel = FRAMEWORK_LABEL[framework] ?? 'NCA ECC';

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
              {finding.excerpt ? <HighlightedExcerpt text={finding.excerpt} category={finding.category} /> : null}
              <div className="finding-footer">
                <span>{controlLabel}: {(finding[controlKey] ?? finding.eccControls ?? []).join(', ')}</span>
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

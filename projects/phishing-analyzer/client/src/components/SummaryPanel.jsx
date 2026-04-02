const analysisSourceLabels = {
  openai_structured: 'OpenAI + guardrails',
  deterministic_fallback: 'Deterministic analysis',
  deterministic_override: 'Deterministic override'
};

function SummaryPanel({ title, body, verdict, confidence, analysisSource, tone = 'executive' }) {
  return (
    <section className="panel summary-panel">
      <div className="panel-heading compact">
        <h2>{title}</h2>
        <div className="summary-badges">
          {analysisSource ? (
            <span className={`source-chip source-${analysisSource}`}>{analysisSourceLabels[analysisSource] || analysisSource}</span>
          ) : null}
          {confidence !== undefined ? <span className="confidence-chip">Confidence {confidence}%</span> : null}
        </div>
      </div>
      <p className={tone === 'technical' ? 'technical-copy' : ''}>{body}</p>
      {verdict ? <div className="subtle-note">Verdict: {verdict.replace('_', ' ')}</div> : null}
    </section>
  );
}

export default SummaryPanel;

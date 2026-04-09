import type { PromptAnalysis } from "@shared/types/analysis";

interface AssumptionsPanelProps {
  analysis: PromptAnalysis;
  loading: boolean;
  onProceed: () => void;
}

export function AssumptionsPanel({ analysis, loading, onProceed }: AssumptionsPanelProps) {
  const hasVisibleAssumptions = analysis.assumptions.length > 0;

  return (
    <section className="panel status-panel">
      <div className="status-header">
        <h2>Assumptions made</h2>
        <span className="status-pill amber">Needs confirmation</span>
      </div>
      <p className="status-copy">
        {hasVisibleAssumptions
          ? "The prompt is a bit ambiguous, so the diagram will be generated using the inferred details below unless you revise the prompt."
          : "The prompt is a bit ambiguous. Generate anyway to let the app fill in the missing details, or revise the prompt to be more specific."}
      </p>
      {hasVisibleAssumptions ? (
        <ul className="bullet-list">
          {analysis.assumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
      ) : null}
      <div className="actions">
        <button className="primary-button" disabled={loading} onClick={onProceed}>
          {loading ? "Generating..." : "Generate anyway"}
        </button>
      </div>
    </section>
  );
}

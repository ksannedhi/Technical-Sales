import type { PromptAnalysis } from "@shared/types/analysis";

interface AssumptionsPanelProps {
  analysis: PromptAnalysis;
  loading: boolean;
  onProceed: () => void;
  onSelectExample?: (prompt: string) => void;
}

export function AssumptionsPanel({ analysis, loading, onProceed, onSelectExample }: AssumptionsPanelProps) {
  const hasHint = Boolean(analysis.clarificationHint);
  const hasExamples = (analysis.examplePrompts?.length ?? 0) > 0;
  const hasAssumptions = analysis.assumptions.length > 0;

  return (
    <section className="panel status-panel">
      <div className="status-header">
        <h2>Needs more detail</h2>
        <span className="status-pill amber">Ambiguous</span>
      </div>

      {hasHint ? (
        <>
          <p className="status-copy clarification-question">{analysis.clarificationHint}</p>
          {hasExamples ? (
            <div className="clarification-examples">
              {analysis.examplePrompts!.map((example) => (
                <button
                  key={example}
                  className="clarification-chip"
                  disabled={loading}
                  onClick={() => onSelectExample?.(example)}
                  type="button"
                >
                  {example}
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <p className="status-copy">
          {hasAssumptions
            ? "The prompt is a bit ambiguous, so the diagram will be generated using the inferred details below unless you revise the prompt."
            : "The prompt is a bit ambiguous. Generate anyway to let the app fill in the missing details, or revise the prompt to be more specific."}
        </p>
      )}

      {hasAssumptions ? (
        <ul className="bullet-list">
          {analysis.assumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
      ) : null}

      <div className="actions clarification-actions">
        <button className="secondary-button" disabled={loading} onClick={onProceed} type="button">
          {loading ? "Generating..." : "Generate anyway"}
        </button>
      </div>
    </section>
  );
}

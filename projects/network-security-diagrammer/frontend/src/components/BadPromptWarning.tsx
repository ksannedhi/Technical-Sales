import type { PromptAnalysis } from "@shared/types/analysis";

interface BadPromptWarningProps {
  analysis: PromptAnalysis;
  loading: boolean;
  onProceed: () => void;
}

export function BadPromptWarning({ analysis, loading, onProceed }: BadPromptWarningProps) {
  return (
    <section className="panel status-panel warning-panel">
      <div className="status-header">
        <h2>This prompt suggests an insecure design</h2>
        <span className="status-pill red">Secure alternative recommended</span>
      </div>
      <p className="status-copy">The app will not render the unsafe design as requested, but it can generate a safer architecture that preserves the likely intent.</p>
      <ul className="bullet-list">
        {analysis.unsafeReasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      <div className="actions">
        <button className="primary-button danger-button" disabled={loading} onClick={onProceed}>
          {loading ? "Generating..." : "Generate secure alternative"}
        </button>
      </div>
    </section>
  );
}

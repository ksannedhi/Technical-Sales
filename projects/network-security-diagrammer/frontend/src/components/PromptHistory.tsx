interface PromptHistoryEntry {
  id: string;
  kind: "initial" | "followup";
  text: string;
}

interface PromptHistoryProps {
  entries: PromptHistoryEntry[];
}

export function PromptHistory({ entries }: PromptHistoryProps) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <section className="panel prompt-history-panel">
      <div className="status-header">
        <h2>Prompt history</h2>
        <span className="status-pill neutral">Current session</span>
      </div>
      <div className="prompt-history-list">
        {entries.map((entry, index) => (
          <article className="prompt-history-item" key={entry.id}>
            <p className="prompt-history-label">
              {entry.kind === "initial" ? "Initial prompt" : `Follow-up ${index}`}
            </p>
            <p className="prompt-history-text">{entry.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

interface PromptHistoryEntry {
  id: string;
  kind: "initial" | "followup" | "refined-from";
  text: string;
}

interface PromptHistoryProps {
  entries: PromptHistoryEntry[];
}

export function PromptHistory({ entries }: PromptHistoryProps) {
  if (entries.length === 0) {
    return null;
  }

  let followupCount = 0;

  return (
    <section className="panel prompt-history-panel">
      <div className="status-header">
        <h2>Prompt history</h2>
        <span className="status-pill neutral">Current session</span>
      </div>
      <div className="prompt-history-list">
        {entries.map((entry) => {
          const isFollowup = entry.kind === "followup";
          if (isFollowup) followupCount += 1;
          return (
            <article
              className={`prompt-history-item${entry.kind === "refined-from" ? " prompt-history-item--dimmed" : ""}`}
              key={entry.id}
            >
              <p className="prompt-history-label">
                {entry.kind === "refined-from"
                  ? "Original prompt"
                  : entry.kind === "initial"
                    ? (entries.some((e) => e.kind === "refined-from") ? "Refined prompt" : "Initial prompt")
                    : `Follow-up ${followupCount}`}
              </p>
              <p className="prompt-history-text">{entry.text}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

import type { KeyboardEvent } from "react";

interface FollowUpBoxProps {
  instruction: string;
  loading: boolean;
  onInstructionChange: (value: string) => void;
  onSubmit: () => void;
}

export function FollowUpBox({
  instruction,
  loading,
  onInstructionChange,
  onSubmit,
}: FollowUpBoxProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  }

  return (
    <section className="panel">
      <div className="status-header">
        <h2>Follow-up prompt</h2>
        <span className="status-pill neutral">Edits current architecture</span>
      </div>
      <label className="field">
        <span>Refine, extend, or replace part of the current design</span>
        <div className="composer-shell">
          <textarea
            value={instruction}
            onChange={(event) => onInstructionChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Example: Add SIEM and monitoring flow"
            rows={3}
          />
          <button
            className="composer-submit"
            aria-label="Apply follow-up"
            disabled={loading || !instruction.trim()}
            onClick={onSubmit}
            type="button"
          >
            ↑
          </button>
        </div>
      </label>
      <p className="hint-copy">Press Enter to apply. Use Shift+Enter for a new line.</p>
    </section>
  );
}

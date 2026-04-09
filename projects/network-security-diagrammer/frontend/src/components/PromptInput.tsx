import type { KeyboardEvent } from "react";

interface PromptInputProps {
  prompt: string;
  loading: boolean;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
}

export function PromptInput({ prompt, loading, onPromptChange, onSubmit }: PromptInputProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  }

  return (
    <section className="panel hero-panel">
      <div>
        <p className="eyebrow">Network / Security Only</p>
        <h1>Turn rough ideas into clean architectural diagrams.</h1>
        <p className="lede">
          The app uses Excalidraw plus an LLM to infer intent, enforce sound architectural patterns, and turn rough prompts into presentable conceptual diagrams.
        </p>
      </div>

      <label className="field">
        <span>Describe the architecture</span>
        <div className="composer-shell">
          <textarea
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Example: secure remote access for users reaching an internal application"
            rows={5}
          />
          <button
            className="composer-submit"
            aria-label="Analyze prompt"
            disabled={loading || !prompt.trim()}
            onClick={onSubmit}
            type="button"
          >
            ↑
          </button>
        </div>
      </label>
      <p className="hint-copy">Press Enter to submit. Use Shift+Enter for a new line.</p>
    </section>
  );
}

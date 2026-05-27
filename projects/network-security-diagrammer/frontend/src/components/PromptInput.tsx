import { forwardRef, type KeyboardEvent } from "react";

interface ExamplePrompt {
  label: string;
  prompt: string;
}

interface PromptInputProps {
  prompt: string;
  loading: boolean;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
  examples?: ExamplePrompt[];
  onExampleSelect?: (prompt: string) => void;
}

export const PromptInput = forwardRef<HTMLTextAreaElement, PromptInputProps>(
  function PromptInput({ prompt, loading, onPromptChange, onSubmit, examples, onExampleSelect }, ref) {
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
        <h1>Turn rough ideas into clean diagrams.</h1>
        <p className="lede">
          Describe a network or security architecture — the app infers intent, enforces sound patterns, and produces an Excalidraw diagram.
        </p>
      </div>

      <label className="field">
        <span>Describe the architecture</span>
        <div className="composer-shell">
          <textarea
            ref={ref}
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Example: secure remote access for users reaching an internal application"
            rows={6}
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

      {examples && examples.length > 0 && onExampleSelect && (
        <div className="example-chips">
          {examples.map(({ label, prompt: exPrompt }) => (
            <button
              key={label}
              className="example-chip"
              disabled={loading}
              onClick={() => onExampleSelect(exPrompt)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
});


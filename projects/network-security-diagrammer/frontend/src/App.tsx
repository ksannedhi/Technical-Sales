import { useState } from "react";
import type { PromptAnalysis } from "@shared/types/analysis";
import type { DiagramResponse } from "@shared/types/diagram";
import { AssumptionsPanel } from "./components/AssumptionsPanel";
import { BadPromptWarning } from "./components/BadPromptWarning";
import { DiagramCanvas } from "./components/DiagramCanvas";
import { FollowUpBox } from "./components/FollowUpBox";
import { PromptHistory } from "./components/PromptHistory";
import { PromptInput } from "./components/PromptInput";
import { analyzePrompt, followupDiagram, generateDiagram } from "./lib/api";

interface PromptHistoryEntry {
  id: string;
  kind: "initial" | "followup";
  text: string;
}

export default function App() {
  const [prompt, setPrompt] = useState("");
  const [lastSubmittedPrompt, setLastSubmittedPrompt] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [promptHistory, setPromptHistory] = useState<PromptHistoryEntry[]>([]);
  const [analysis, setAnalysis] = useState<PromptAnalysis | null>(null);
  const [diagram, setDiagram] = useState<DiagramResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const assumptions = diagram?.architecture.assumptions ?? [];
  const appliedChanges = diagram?.architecture.appliedChanges ?? [];

  async function submitPrompt() {
    const submittedPrompt = prompt.trim();
    if (!submittedPrompt) {
      return;
    }

    setLoading(true);
    setError(null);
    setDiagram(null);
    setLastSubmittedPrompt(submittedPrompt);
    setPromptHistory([
      {
        id: `initial-${Date.now()}`,
        kind: "initial",
        text: submittedPrompt,
      },
    ]);
    setPrompt("");

    try {
      const nextAnalysis = await analyzePrompt(submittedPrompt);
      setAnalysis(nextAnalysis);

      if (nextAnalysis.status === "clear") {
        const response = await generateDiagram({ prompt: submittedPrompt });
        setDiagram(response);
      }
    } catch (nextError) {
      setError((nextError as { error?: string }).error ?? "Could not analyze the prompt.");
    } finally {
      setLoading(false);
    }
  }

  async function generateFromAnalysis(options: {
    confirmedAssumptions?: boolean;
    secureAlternative?: boolean;
  }) {
    setLoading(true);
    setError(null);

    try {
      const response = await generateDiagram({
        prompt: lastSubmittedPrompt,
        ...options,
      });
      setDiagram(response);
    } catch (nextError) {
      setError((nextError as { error?: string }).error ?? "Could not generate the diagram.");
    } finally {
      setLoading(false);
    }
  }

  async function applyFollowUp() {
    const instruction = followUp.trim();
    if (!diagram || !instruction) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await followupDiagram({
        architecture: diagram.architecture,
        analysis: diagram.analysis,
        instruction,
      });
      setDiagram(response);
      setPromptHistory((current) => [
        ...current,
        {
          id: `followup-${Date.now()}`,
          kind: "followup",
          text: instruction,
        },
      ]);
      setFollowUp("");
    } catch (nextError) {
      setError((nextError as { error?: string }).error ?? "Could not apply the follow-up prompt.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <div className="app-grid">
        <div className="left-column">
          <PromptInput prompt={prompt} loading={loading} onPromptChange={setPrompt} onSubmit={submitPrompt} />

          {analysis?.status === "ambiguous" ? (
            <AssumptionsPanel
              analysis={analysis}
              loading={loading}
              onProceed={() => generateFromAnalysis({ confirmedAssumptions: true })}
            />
          ) : null}

          {analysis?.status === "bad" ? (
            <BadPromptWarning
              analysis={analysis}
              loading={loading}
              onProceed={() => generateFromAnalysis({ secureAlternative: true })}
            />
          ) : null}

          {diagram ? (
            <>
              <section className="panel summary-panel">
                <div className="status-header">
                  <h2>Architecture summary</h2>
                  <span className="status-pill neutral">Simplicity-first</span>
                </div>
                <p>{diagram.architecture.summary}</p>
                {assumptions.length > 0 ? (
                  <>
                    <h3>Assumptions</h3>
                    <ul className="bullet-list compact">
                      {assumptions.map((assumption) => (
                        <li key={assumption}>{assumption}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {appliedChanges.length > 0 ? (
                  <>
                    <h3>Applied changes</h3>
                    <ul className="bullet-list compact">
                      {appliedChanges.map((change) => (
                        <li key={change}>{change}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </section>
            </>
          ) : null}

          {error ? <section className="panel error-panel">{error}</section> : null}
        </div>

        <div className="right-column">
          {diagram ? (
            <>
              <PromptHistory entries={promptHistory} />
              <DiagramCanvas title={diagram.architecture.title} elements={diagram.elements} />
              <FollowUpBox
                instruction={followUp}
                loading={loading}
                onInstructionChange={setFollowUp}
                onSubmit={applyFollowUp}
              />
            </>
          ) : (
            <section className="panel empty-state">
              <p className="eyebrow">Preview</p>
              <h2>The generated diagram will appear here.</h2>
              <p>Start with a network or security prompt, and the app will guide you through assumptions or secure alternatives before rendering.</p>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

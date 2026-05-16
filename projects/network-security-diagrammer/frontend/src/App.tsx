import { useEffect, useRef, useState } from "react";
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
  kind: "initial" | "followup" | "refined-from";
  text: string;
}

export default function App() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [prompt, setPrompt] = useState("");
  const [lastSubmittedPrompt, setLastSubmittedPrompt] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [promptHistory, setPromptHistory] = useState<PromptHistoryEntry[]>([]);
  const [analysis, setAnalysis] = useState<PromptAnalysis | null>(null);
  const [diagram, setDiagram] = useState<DiagramResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refinedFromPrompt, setRefinedFromPrompt] = useState<string | null>(null);
  const assumptions = diagram?.architecture.assumptions ?? [];
  const appliedChanges = diagram?.architecture.appliedChanges ?? [];

  useEffect(() => {
    if (!loading) {
      setIsAiLoading(false);
      return;
    }
    const timer = setTimeout(() => setIsAiLoading(true), 3000);
    return () => clearTimeout(timer);
  }, [loading]);

  async function submitPrompt() {
    const submittedPrompt = prompt.trim();
    if (!submittedPrompt) {
      return;
    }

    setLoading(true);
    setError(null);
    setDiagram(null);
    setLastSubmittedPrompt(submittedPrompt);
    const historyEntries: PromptHistoryEntry[] = [];
    if (refinedFromPrompt) {
      historyEntries.push({ id: `refined-from-${Date.now()}`, kind: "refined-from", text: refinedFromPrompt });
      setRefinedFromPrompt(null);
    }
    historyEntries.push({ id: `initial-${Date.now()}`, kind: "initial", text: submittedPrompt });
    setPromptHistory(historyEntries);
    setPrompt("");

    try {
      const nextAnalysis = await analyzePrompt(submittedPrompt);
      setAnalysis(nextAnalysis);

      if (nextAnalysis.status === "clear") {
        const response = await generateDiagram({ prompt: submittedPrompt });
        setDiagram(response);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not analyze the prompt.");
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
      setError(nextError instanceof Error ? nextError.message : "Could not generate the diagram.");
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
      setError(nextError instanceof Error ? nextError.message : "Could not apply the follow-up prompt.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <div className="app-grid">
        <div className="left-column">
          <PromptInput ref={textareaRef} prompt={prompt} loading={loading} onPromptChange={setPrompt} onSubmit={submitPrompt} />

          {analysis?.status === "ambiguous" ? (
            <AssumptionsPanel
              analysis={analysis}
              loading={loading}
              onProceed={() => generateFromAnalysis({ confirmedAssumptions: true })}
              onSelectExample={(example) => {
                setRefinedFromPrompt(lastSubmittedPrompt);
                setPrompt(example);
                setAnalysis(null);
                setTimeout(() => textareaRef.current?.focus(), 0);
              }}
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

          {diagram?.architecture.securityRationale && diagram.architecture.securityRationale.length > 0 ? (
            <section className="panel rationale-panel">
              <h2>Why this design</h2>
              <ul className="bullet-list compact">
                {diagram.architecture.securityRationale.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </section>
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
          ) : loading ? (
            <section className="panel loading-state">
              <div className="loading-spinner" />
              <p className="loading-message">
                {isAiLoading
                  ? "Designing with AI — this may take a few seconds…"
                  : "Analyzing your prompt…"}
              </p>
            </section>
          ) : (
            <section className="panel empty-state">
              <svg className="empty-state-icon" viewBox="0 0 120 80" fill="none" aria-hidden="true">
                <rect x="48" y="2" width="24" height="16" rx="4" fill="#d4cbbd" />
                <rect x="2" y="32" width="24" height="16" rx="4" fill="#d4cbbd" />
                <rect x="48" y="32" width="24" height="16" rx="4" fill="#1f4f46" opacity="0.7" />
                <rect x="94" y="32" width="24" height="16" rx="4" fill="#d4cbbd" />
                <rect x="16" y="62" width="24" height="16" rx="4" fill="#d4cbbd" />
                <rect x="80" y="62" width="24" height="16" rx="4" fill="#d4cbbd" />
                <line x1="60" y1="18" x2="14" y2="32" stroke="#b5aa9a" strokeWidth="1.5" strokeDasharray="4 3" />
                <line x1="60" y1="18" x2="60" y2="32" stroke="#b5aa9a" strokeWidth="1.5" strokeDasharray="4 3" />
                <line x1="60" y1="18" x2="106" y2="32" stroke="#b5aa9a" strokeWidth="1.5" strokeDasharray="4 3" />
                <line x1="14" y1="48" x2="28" y2="62" stroke="#b5aa9a" strokeWidth="1.5" strokeDasharray="4 3" />
                <line x1="106" y1="48" x2="92" y2="62" stroke="#b5aa9a" strokeWidth="1.5" strokeDasharray="4 3" />
              </svg>
              <p className="eyebrow">Preview</p>
              <h2>Your diagram will appear here.</h2>
              <p>Try one of these to get started:</p>
              <div className="example-chips">
                <button className="example-chip" onClick={() => { setPrompt("Zero trust access for remote employees reaching internal apps"); textareaRef.current?.focus(); }}>Zero trust remote access</button>
                <button className="example-chip" onClick={() => { setPrompt("DMZ with WAF and on-prem application servers"); textareaRef.current?.focus(); }}>WAF in DMZ</button>
                <button className="example-chip" onClick={() => { setPrompt("Secure email with Exchange and on-prem filtering appliance"); textareaRef.current?.focus(); }}>Email security with Exchange</button>
                <button className="example-chip" onClick={() => { setPrompt("Centralized SIEM with log collection from network and security sources"); textareaRef.current?.focus(); }}>Centralized SIEM</button>
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

import type { PromptAnalysis } from "@shared/types/analysis";
import type { ArchitectureModel } from "@shared/types/architecture";
import type { DiagramResponse } from "@shared/types/diagram";

async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw payload;
  }

  return payload as T;
}

export function analyzePrompt(prompt: string) {
  return post<PromptAnalysis>("/api/analyze", { prompt });
}

export function generateDiagram(input: {
  prompt: string;
  confirmedAssumptions?: boolean;
  secureAlternative?: boolean;
}) {
  return post<DiagramResponse>("/api/generate", input);
}

export function followupDiagram(input: {
  architecture: ArchitectureModel;
  analysis?: PromptAnalysis;
  instruction: string;
}) {
  return post<DiagramResponse>("/api/followup", input);
}

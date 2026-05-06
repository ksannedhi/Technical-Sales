import type { PromptAnalysis } from "@shared/types/analysis";
import type { ArchitectureModel } from "@shared/types/architecture";
import type { DiagramResponse } from "@shared/types/diagram";

class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(`Server returned a non-JSON response (${response.status}).`);
  }

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof (payload as { error: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `Request failed (${response.status}).`;
    throw new ApiError(message);
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

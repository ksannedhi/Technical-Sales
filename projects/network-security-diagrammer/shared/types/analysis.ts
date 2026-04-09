export type PromptStatus = "clear" | "ambiguous" | "bad";

export interface PromptAnalysis {
  status: PromptStatus;
  normalizedPrompt: string;
  assumptions: string[];
  unsafeReasons: string[];
  secureAlternativeAvailable: boolean;
  confidence: number;
}

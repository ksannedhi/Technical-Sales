import { z } from "zod";

export const promptAnalysisSchema = z.object({
  status: z.enum(["clear", "ambiguous", "bad"]),
  normalizedPrompt: z.string().min(1),
  assumptions: z.array(z.string()),
  unsafeReasons: z.array(z.string()),
  secureAlternativeAvailable: z.boolean(),
  confidence: z.number().min(0).max(1),
});

export const promptRequestSchema = z.object({
  prompt: z.string().min(3),
});

import { z } from "zod";

import { promptAnalysisSchema } from "./analysisSchema.js";

export const architectureSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  assumptions: z.array(z.string()),
  appliedChanges: z.array(z.string()).default([]),
  zones: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      type: z.enum([
        "external",
        "dmz",
        "security-zone",
        "internal",
        "cloud",
        "branch",
        "data-center",
      ]),
    }),
  ),
  components: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      type: z.enum([
        "user",
        "network",
        "security-control",
        "identity",
        "application",
        "data",
        "monitoring",
        "integration",
      ]),
      zoneId: z.string().min(1),
      importance: z.enum(["normal", "critical"]).optional(),
    }),
  ),
  connections: z.array(
    z.object({
      id: z.string().min(1),
      from: z.string().min(1),
      to: z.string().min(1),
      label: z.string().optional(),
      style: z.enum(["solid", "dashed"]).optional(),
    }),
  ),
});

export const generateRequestSchema = z.object({
  prompt: z.string().min(3),
  confirmedAssumptions: z.boolean().optional(),
  secureAlternative: z.boolean().optional(),
});

export const followupRequestSchema = z.object({
  architecture: architectureSchema,
  analysis: promptAnalysisSchema.optional(),
  instruction: z.string().min(2),
});

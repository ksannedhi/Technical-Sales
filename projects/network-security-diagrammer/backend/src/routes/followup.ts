import type { Request, Response } from "express";
import type { DiagramResponse } from "../../../shared/types/diagram.js";
import { layoutArchitecture } from "../layout/layoutArchitecture.js";
import { followupRequestSchema } from "../schemas/architectureSchema.js";
import { editArchitectureWithModel } from "../services/followupEditor.js";
import type { PromptAnalysis } from "../../../shared/types/analysis.js";

function buildFollowupAnalysis(parsed: Request["body"] & { analysis?: PromptAnalysis; architecture: DiagramResponse["architecture"] }) {
  if (parsed.analysis) {
    return parsed.analysis;
  }

  return {
    status: "clear" as const,
    normalizedPrompt: parsed.architecture.title,
    assumptions: parsed.architecture.assumptions ?? [],
    unsafeReasons: [],
    secureAlternativeAvailable: false,
    confidence: 0.88,
  };
}

export async function followupRoute(req: Request, res: Response) {
  const parsed = followupRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid follow-up payload." });
  }

  const architecture = await editArchitectureWithModel(parsed.data.architecture, parsed.data.instruction);
  const { layout, elements } = layoutArchitecture(architecture);
  const response: DiagramResponse = {
    analysis: buildFollowupAnalysis(parsed.data),
    architecture,
    layout,
    elements,
  };

  return res.json(response);
}

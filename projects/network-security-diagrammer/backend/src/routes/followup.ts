import type { Request, Response } from "express";
import type { DiagramResponse } from "../../../shared/types/diagram.js";
import { layoutArchitecture } from "../layout/layoutArchitecture.js";
import { followupRequestSchema } from "../schemas/architectureSchema.js";
import { editArchitectureWithModel } from "../services/followupEditor.js";
import { createCacheKey, readCache, writeCache } from "../services/cache.js";
import { getModelCacheIdentity } from "../services/anthropic.js";
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

  const key = createCacheKey({
    type: "followup-v1",
    architecture: parsed.data.architecture,
    instruction: parsed.data.instruction,
    model: getModelCacheIdentity(),
  });

  try {
    const cached = await readCache<DiagramResponse>(key);
    if (cached) {
      return res.json(cached);
    }

    const architecture = await editArchitectureWithModel(parsed.data.architecture, parsed.data.instruction);
    const { layout, elements } = layoutArchitecture(architecture);
    const response: DiagramResponse = {
      analysis: buildFollowupAnalysis(parsed.data),
      architecture,
      layout,
      elements,
    };

    await writeCache(key, response);
    return res.json(response);
  } catch (err) {
    console.error("[followup]", err);
    return res.status(500).json({ error: "Failed to apply follow-up instruction." });
  }
}

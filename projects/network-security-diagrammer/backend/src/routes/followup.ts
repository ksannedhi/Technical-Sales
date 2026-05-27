import type { Request, Response } from "express";
import type { DiagramResponse } from "../../../shared/types/diagram.js";
import { layoutArchitecture } from "../layout/layoutArchitecture.js";
import { followupRequestSchema } from "../schemas/architectureSchema.js";
import { editArchitectureWithModel, FOLLOWUP_HASH } from "../services/followupEditor.js";
import { enforceArchitecturalConstraints, applyFollowupInstruction } from "../services/architectureGenerator.js";
import { createCacheKey, readCache, writeCache } from "../services/cache.js";
import { getModelCacheIdentity } from "../services/anthropic.js";
import type { PromptAnalysis } from "../../../shared/types/analysis.js";
import { normalizePrompt } from "../services/promptAnalysis.js";

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
    type: `followup-${FOLLOWUP_HASH}`,
    architecture: parsed.data.architecture,
    instruction: normalizePrompt(parsed.data.instruction).toLowerCase(),
    model: getModelCacheIdentity(),
  });

  try {
    const cached = await readCache<DiagramResponse>(key);
    if (cached) {
      return res.json(cached);
    }

    // Try the local keyword handler first — handles add/remove/rename instructions
    // without spending a Sonnet call. Fall through to Claude only when local logic
    // produces no structural change (i.e. it didn't recognise the instruction).
    const localResult = applyFollowupInstruction(parsed.data.architecture, parsed.data.instruction);
    const changed =
      JSON.stringify(localResult.zones) !== JSON.stringify(parsed.data.architecture.zones) ||
      JSON.stringify(localResult.components) !== JSON.stringify(parsed.data.architecture.components) ||
      JSON.stringify(localResult.connections) !== JSON.stringify(parsed.data.architecture.connections);

    const rawArchitecture = changed
      ? localResult
      : await editArchitectureWithModel(parsed.data.architecture, parsed.data.instruction);
    const architecture = enforceArchitecturalConstraints(rawArchitecture);
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

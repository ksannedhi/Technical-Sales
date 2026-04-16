import type { Request, Response } from "express";
import type { DiagramResponse } from "../../../shared/types/diagram.js";
import { layoutArchitecture } from "../layout/layoutArchitecture.js";
import { generateRequestSchema } from "../schemas/architectureSchema.js";
import { generateArchitecture } from "../services/architectureGenerator.js";
import { createCacheKey, readCache, writeCache } from "../services/cache.js";
import { getModelCacheIdentity } from "../services/openai.js";
import { analyzePromptWithModel } from "../services/promptAnalysis.js";

export async function generateRoute(req: Request, res: Response) {
  const parsed = generateRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid generation payload." });
  }

  const analysis = await analyzePromptWithModel(parsed.data.prompt);
  if (analysis.status === "ambiguous" && !parsed.data.confirmedAssumptions) {
    return res.status(409).json({
      error: "Assumptions must be confirmed before generating this diagram.",
      analysis,
    });
  }

  if (analysis.status === "bad" && !parsed.data.secureAlternative) {
    return res.status(409).json({
      error: "Secure alternative must be confirmed before generating this diagram.",
      analysis,
    });
  }

  const key = createCacheKey({
    type: "generate-v10",
    prompt: parsed.data.prompt,
    confirmedAssumptions: parsed.data.confirmedAssumptions,
    secureAlternative: parsed.data.secureAlternative,
    model: getModelCacheIdentity(),
  });
  const cached = await readCache<DiagramResponse>(key);
  if (cached) {
    return res.json(cached);
  }

  const architecture = await generateArchitecture(parsed.data.prompt, analysis);
  const { layout, elements } = layoutArchitecture(architecture);
  const response: DiagramResponse = {
    analysis,
    architecture,
    layout,
    elements,
  };

  await writeCache(key, response);
  return res.json(response);
}

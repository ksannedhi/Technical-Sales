import type { Request, Response } from "express";
import { promptRequestSchema } from "../schemas/analysisSchema.js";
import { createCacheKey, readCache, writeCache } from "../services/cache.js";
import { getModelCacheIdentity } from "../services/anthropic.js";
import { analyzePromptWithModel, normalizePrompt } from "../services/promptAnalysis.js";

export async function analyzeRoute(req: Request, res: Response) {
  const parsed = promptRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid prompt payload." });
  }

  const key = createCacheKey({
    type: "analysis-v5",
    prompt: normalizePrompt(parsed.data.prompt).toLowerCase(),
    model: getModelCacheIdentity(),
  });
  const cached = await readCache(key);
  if (cached) {
    return res.json(cached);
  }

  try {
    const analysis = await analyzePromptWithModel(parsed.data.prompt);
    await writeCache(key, analysis);
    return res.json(analysis);
  } catch (err) {
    console.error("[analyze]", err);
    return res.status(500).json({ error: "Failed to analyze prompt." });
  }
}

import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;
let clientApiKey: string | null = null;

export function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    client = null;
    clientApiKey = null;
    return null;
  }

  if (!client || clientApiKey !== apiKey) {
    client = new Anthropic({ apiKey });
    clientApiKey = apiKey;
  }

  return client;
}

export function getAnalyzeModel() {
  return process.env.ANTHROPIC_ANALYZE_MODEL || "claude-haiku-4-5-20251001";
}

export function getGenerateModel() {
  return process.env.ANTHROPIC_GENERATE_MODEL || "claude-sonnet-4-6";
}

export function getModelCacheIdentity() {
  const provider = getAnthropicClient() ? "anthropic" : "local";
  return `${provider}:${getAnalyzeModel()}:${getGenerateModel()}`;
}

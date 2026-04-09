import OpenAI from "openai";

let client: OpenAI | null = null;
let clientApiKey: string | null = null;

export function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    client = null;
    clientApiKey = null;
    return null;
  }

  if (!client || clientApiKey !== apiKey) {
    client = new OpenAI({ apiKey });
    clientApiKey = apiKey;
  }

  return client;
}

export function getOpenAIModel() {
  return process.env.OPENAI_MODEL || "gpt-4.1-mini";
}

export function getModelCacheIdentity() {
  const provider = getOpenAIClient() ? "openai" : "local";
  return `${provider}:${getOpenAIModel()}`;
}

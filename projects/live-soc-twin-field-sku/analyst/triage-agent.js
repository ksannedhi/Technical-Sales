const { triageWithOpenAI } = require("./provider-adapter");

async function triageAlert(alert) {
  const apiKey = process.env.OPENAI_API_KEY || "";
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  return triageWithOpenAI(apiKey, model, alert);
}

module.exports = { triageAlert };
const { triageWithAnthropic } = require("./provider-adapter");

async function triageAlert(alert, context = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY || "";
  const model = process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest";
  return triageWithAnthropic(apiKey, model, alert, context);
}

module.exports = { triageAlert };

const Anthropic = require("@anthropic-ai/sdk");

const MODEL_FALLBACKS = {
  "claude-haiku-4-5": [],
  "claude-3-5-haiku-latest": ["claude-haiku-4-5"],
  "claude-3-5-haiku-20241022": ["claude-haiku-4-5"],
  "claude-sonnet-4-6": [],
  "claude-3-5-sonnet-latest": ["claude-sonnet-4-6"],
  "claude-3-7-sonnet-latest": ["claude-sonnet-4-6"]
};

function summarizeAlert(alert, context = {}) {
  const incidentCount = Array.isArray(context.relatedAlerts) ? context.relatedAlerts.length : 0;

  return {
    provider: "local-fallback",
    threat_assessment: `Potential ${alert.mitre_tactic} activity: ${alert.event_type}`,
    context_correlation: incidentCount > 1
      ? `This alert is linked with ${incidentCount} related events in the same incident chain.`
      : "This alert is currently being assessed with limited correlated context.",
    mitre_mapping: `${alert.mitre_technique_id} (${alert.mitre_technique_name})`,
    risk_score: ["critical", "high"].includes(alert.severity) ? 8 : 5,
    recommended_action: ["critical", "high"].includes(alert.severity) ? "ESCALATE TO TIER-2" : "INVESTIGATE",
    next_steps: [
      `Validate activity on host ${alert.dest_hostname}.`,
      `Review source ${alert.source_ip} and user ${alert.dest_user}.`,
      "Confirm if surrounding alerts indicate the same attack chain."
    ],
    note: "Anthropic API key not configured, so a local fallback summary was used."
  };
}

function buildPrompt(alert, context) {
  return [
    "You are ARIA, an AI Tier-1 SOC analyst.",
    "Return valid JSON only.",
    "Use this exact shape:",
    "{\"threat_assessment\":\"\",\"context_correlation\":\"\",\"mitre_mapping\":\"\",\"risk_score\":0,\"recommended_action\":\"\",\"next_steps\":[\"\",\"\"],\"note\":\"\"}",
    "Keep answers concise and operational.",
    "",
    `Alert: ${JSON.stringify(alert)}`,
    `Context: ${JSON.stringify(context)}`
  ].join("\n");
}

function extractText(response) {
  if (!Array.isArray(response.content)) return "";
  const parts = response.content
    .filter((item) => item.type === "text" && item.text)
    .map((item) => item.text);
  return parts.join("\n").trim();
}

async function triageWithAnthropic(apiKey, model, alert, context = {}) {
  if (!apiKey) {
    return summarizeAlert(alert, context);
  }

  const client = new Anthropic({ apiKey });
  let response;
  let resolvedModel = model;
  const modelsToTry = [model, ...(MODEL_FALLBACKS[model] || [])];
  let lastError = null;

  for (const candidate of modelsToTry) {
    try {
      response = await client.messages.create({
        model: candidate,
        max_tokens: 500,
        temperature: 0.2,
        system: "Return only valid JSON with no markdown, no code fences, and no extra text.",
        messages: [
          {
            role: "user",
            content: buildPrompt(alert, context)
          }
        ]
      });
      resolvedModel = candidate;
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!response) {
    const attempted = modelsToTry.join(", ");
    const message = lastError?.message || "Anthropic request failed.";
    throw new Error(`Anthropic triage failed for models: ${attempted}. ${message}`);
  }

  const text = extractText(response);
  if (!text) {
    throw new Error("Anthropic returned an empty triage response.");
  }

  let parsed;
  try {
    // Strip markdown fences, then extract the outermost JSON object
    const stripped = text
      .replace(/^```(?:json)?\s*/m, "")
      .replace(/\s*```$/m, "")
      .trim();
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("no JSON object found");
    parsed = JSON.parse(stripped.slice(start, end + 1));
  } catch (err) {
    console.error("[ARIA] Raw model response that failed to parse:\n", text);
    throw new Error(`Anthropic triage response was not valid JSON: ${err.message}`);
  }

  return {
    provider: "anthropic",
    model: resolvedModel,
    threat_assessment: parsed.threat_assessment || summarizeAlert(alert, context).threat_assessment,
    context_correlation: parsed.context_correlation || "",
    mitre_mapping: parsed.mitre_mapping || `${alert.mitre_technique_id} (${alert.mitre_technique_name})`,
    risk_score: Number(parsed.risk_score || 0),
    recommended_action: parsed.recommended_action || "INVESTIGATE",
    next_steps: Array.isArray(parsed.next_steps) ? parsed.next_steps.slice(0, 5) : [],
    note: parsed.note || ""
  };
}

module.exports = { triageWithAnthropic, summarizeAlert };

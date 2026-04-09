import type { PromptAnalysis } from "../../../shared/types/analysis.js";
import { promptAnalysisSchema } from "../schemas/analysisSchema.js";
import { getOpenAIClient, getOpenAIModel } from "./openai.js";

const ambiguousPatterns = [
  /secure architecture/i,
  /cloud setup with best practices/i,
  /modern network design/i,
  /secure app flow/i,
];

const badPatterns = [
  {
    pattern: /expose .*database.*internet/i,
    reason: "Databases should not be exposed directly to the internet.",
  },
  {
    pattern: /allow all traffic/i,
    reason: "Allow-all connectivity violates least privilege and segmentation principles.",
  },
  {
    pattern: /skip authentication/i,
    reason: "Skipping authentication creates an unsafe access model.",
  },
  {
    pattern: /everything in public subnet/i,
    reason: "Putting all tiers in public subnets removes basic network isolation.",
  },
];

function normalizePrompt(prompt: string) {
  return prompt
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^show\s+/i, "Design ")
    .replace(/^how to\s+/i, "Design ");
}

function sanitizeAssumptions(assumptions: string[]) {
  const seen = new Set<string>();

  return assumptions.filter((assumption) => {
    const normalized = assumption.trim().toLowerCase();
    const isDefaultBehavior =
      /vendor-neutral cloud environment/i.test(assumption) ||
      /vendor-neutral controls unless the prompt explicitly names a platform or product/i.test(assumption) ||
      /architect-level conceptual diagram instead of an implementation-level design/i.test(assumption);

    if (isDefaultBehavior || normalized.length === 0 || seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
}

export function analyzePrompt(prompt: string): PromptAnalysis {
  const normalizedPrompt = normalizePrompt(prompt);
  const unsafeReasons = badPatterns
    .filter((entry) => entry.pattern.test(prompt))
    .map((entry) => entry.reason);

  if (unsafeReasons.length > 0) {
    return {
      status: "bad",
      normalizedPrompt: normalizedPrompt
        .replace(/expose/gi, "secure")
        .replace(/allow all traffic/gi, "inspect and restrict traffic")
        .replace(/skip authentication/gi, "enforce authentication")
        .replace(/public subnet/gi, "segmented subnets"),
      assumptions: [
        "A secure alternative will preserve the user's business goal while correcting unsafe design choices.",
      ],
      unsafeReasons,
      secureAlternativeAvailable: true,
      confidence: 0.96,
    };
  }

  const assumptions: string[] = [];
  let status: PromptAnalysis["status"] = "clear";
  let confidence = 0.9;

  if (
    ambiguousPatterns.some((pattern) => pattern.test(prompt)) ||
    normalizedPrompt.split(" ").length < 6
  ) {
    status = "ambiguous";
    confidence = 0.72;
    if (!/internet|dmz|vpn|cloud|hybrid|api|email|ddos|sase|siem|waf|zero trust/i.test(prompt)) {
      assumptions.push("Assumed a standard secure edge-to-internal-network flow with inspection and segmentation.");
    }
  }

  return {
    status,
    normalizedPrompt,
    assumptions: sanitizeAssumptions(assumptions),
    unsafeReasons: [],
    secureAlternativeAvailable: false,
    confidence,
  };
}

export async function analyzePromptWithModel(prompt: string): Promise<PromptAnalysis> {
  const baseline = analyzePrompt(prompt);
  const client = getOpenAIClient();

  if (!client) {
    return baseline;
  }

  if (baseline.status === "bad") {
    return baseline;
  }

  try {
    const response = await client.chat.completions.create({
      model: getOpenAIModel(),
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You classify prompts for a network and security architecture diagram generator.",
            "Return only JSON.",
            "Supported statuses: clear, ambiguous, bad.",
            "Mark ambiguous when important details are missing but a reasonable conceptual design can still be inferred.",
            "Mark bad when the prompt clearly requests an insecure design.",
            "Favor simplicity and architect-level conceptual output.",
            "Vendor-neutral unless the prompt explicitly names a provider or vendor.",
            "This app turns ideas into architectural diagrams with Excalidraw and LLM assistance for inference and pattern enforcement.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            prompt,
            outputFormat: {
              status: "clear|ambiguous|bad",
              normalizedPrompt: "string",
              assumptions: ["string"],
              unsafeReasons: ["string"],
              secureAlternativeAvailable: true,
              confidence: 0.8,
            },
          }),
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return baseline;
    }

    const parsed = promptAnalysisSchema.parse(JSON.parse(content));
    const sanitized = {
      ...parsed,
      assumptions: sanitizeAssumptions(parsed.assumptions),
    };

    if (baseline.status === "ambiguous" && sanitized.status === "clear") {
      return { ...sanitized, status: "ambiguous" };
    }

    return sanitized;
  } catch {
    return baseline;
  }
}

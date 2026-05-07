import type { PromptAnalysis } from "../../../shared/types/analysis.js";
import { promptAnalysisSchema } from "../schemas/analysisSchema.js";
import { getAnthropicClient, getAnalyzeModel } from "./anthropic.js";

const ambiguousPatterns: Array<{
  pattern: RegExp;
  clarificationHint: string;
  examplePrompts: string[];
}> = [
  {
    pattern: /secure architecture/i,
    clarificationHint: "What environment and user base are you designing for?",
    examplePrompts: [
      "Secure architecture for remote employees reaching internal apps over VPN",
      "Secure architecture for a cloud-hosted web app with WAF and identity controls",
      "Secure architecture connecting on-prem data center to AWS with encrypted transit",
    ],
  },
  {
    pattern: /cloud setup with best practices/i,
    clarificationHint: "Which cloud provider, and what type of workload?",
    examplePrompts: [
      "AWS setup with VPC, WAF, and IAM best practices for a web application",
      "Azure landing zone with identity, network segmentation, and centralized monitoring",
      "GCP setup with VPC firewall, Cloud Armor, and IAP for internal tooling",
    ],
  },
  {
    pattern: /modern network design/i,
    clarificationHint: "What does modern mean here — SD-WAN, zero trust, or cloud-first?",
    examplePrompts: [
      "Modern SD-WAN network connecting 5 branch sites to HQ over encrypted overlay",
      "Modern zero trust network replacing legacy VPN for remote employees",
      "Modern cloud-first network with Zscaler and direct internet breakout at branches",
    ],
  },
  {
    pattern: /secure app flow/i,
    clarificationHint: "What type of app, and who are the users?",
    examplePrompts: [
      "Secure web app flow for external customers with WAF, CDN, and API gateway",
      "Secure internal app flow for employees with SSO, MFA, and identity-aware proxy",
      "Secure API flow between microservices with mutual TLS and centralized API gateway",
    ],
  },
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

const outOfScopePatterns = [
  {
    pattern: /ransomware attack (flow|chain|path|scenario)|kill chain|attack chain|lateral movement path|threat actor.*pivot/i,
    reason: "This describes an attack scenario, not a defensive architecture. This tool models protective network designs — try describing the defensive controls you want instead.",
  },
  {
    pattern: /active[- ]active failover|redundant (firewall )?pair|ha (cluster|topology|pair)|high.availability (topology|design|cluster)/i,
    reason: "High-availability and failover topologies are outside the scope of this diagrammer. Try describing the security architecture around the HA deployment instead.",
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

  // Out-of-scope check (before bad patterns — these need a different message, no secure alternative)
  const outOfScopeReasons = outOfScopePatterns
    .filter((entry) => entry.pattern.test(prompt))
    .map((entry) => entry.reason);

  if (outOfScopeReasons.length > 0) {
    return {
      status: "bad",
      normalizedPrompt,
      assumptions: [],
      unsafeReasons: outOfScopeReasons,
      secureAlternativeAvailable: false,
      confidence: 0.92,
    };
  }

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

  const matchedAmbiguous = ambiguousPatterns.find((entry) => entry.pattern.test(prompt));
  const isTooShort = normalizedPrompt.split(" ").length < 6;
  // Only treat a matched ambiguous pattern as genuinely ambiguous when the prompt is short
  // enough that the pattern captures the entire intent (not a substring of a longer specific prompt)
  const wordCount = normalizedPrompt.split(/\s+/).length;
  const isGenuinelyAmbiguous = Boolean(matchedAmbiguous) && wordCount <= 8;

  if (isGenuinelyAmbiguous || isTooShort) {
    status = "ambiguous";
    confidence = 0.72;

    // Only add generic assumption for short unrecognised prompts with no tech signal
    if (!matchedAmbiguous && !/internet|dmz|vpn|cloud|hybrid|api|email|ddos|sase|siem|waf|zero trust/i.test(prompt)) {
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
    ...(isGenuinelyAmbiguous && matchedAmbiguous ? {
      clarificationHint: matchedAmbiguous.clarificationHint,
      examplePrompts: matchedAmbiguous.examplePrompts,
    } : {}),
  };
}

export async function analyzePromptWithModel(prompt: string): Promise<PromptAnalysis> {
  const baseline = analyzePrompt(prompt);
  const client = getAnthropicClient();

  if (!client) {
    return baseline;
  }

  if (baseline.status === "bad") {
    return baseline;
  }

  try {
    const response = await client.messages.create({
      model: getAnalyzeModel(),
      max_tokens: 1024,
      temperature: 0.1,
      system: [
        "You classify prompts for a network and security architecture diagram generator.",
        "Return only valid JSON with no markdown or code fences.",
        "Supported statuses: clear, ambiguous, bad.",
        "Mark ambiguous when important details are missing but a reasonable conceptual design can still be inferred.",
        "Mark bad when the prompt clearly requests an insecure design.",
        "Favor simplicity and architect-level conceptual output.",
        "Vendor-neutral unless the prompt explicitly names a provider or vendor.",
      ].join(" "),
      messages: [
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

    const block = response.content[0];
    const content = block?.type === "text" ? block.text : null;
    if (!content) {
      return baseline;
    }

    const cleaned = content.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();
    const parsed = promptAnalysisSchema.parse(JSON.parse(cleaned));
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

import { createHash } from "crypto";
import type { ArchitectureModel } from "../../../shared/types/architecture.js";
import { architectureSchema } from "../schemas/architectureSchema.js";
import { getAnthropicClient, getGenerateModel } from "./anthropic.js";
import { applyFollowupInstruction, refreshArchitectureText } from "./architectureGenerator.js";

const FOLLOWUP_SYSTEM_PROMPT_LINES = [
  "You update a network and security architecture model based on a follow-up instruction.",
  "Return only valid JSON with no markdown or code fences.",
  "Preserve the current architecture unless the instruction explicitly replaces part of it.",
  "Keep the result architect-level, simple, and vendor-neutral unless explicitly requested.",
  "Maintain 16 components max and 15 connections max whenever possible.",
  "",
  "STRUCTURAL RULES (same as generation — enforce on every edit):",
  "- Monitoring components (SIEM, log aggregator, telemetry) must always be in their own dedicated monitoring zone — never in a zone that also contains security-control components.",
  "- Identity providers must never share a zone with firewall, WAF, or IPS components. Place them in a dedicated identity zone or the application/internal zone.",
  "- All connections must flow top-to-bottom (from a zone earlier in the zones array to one later). Never add upward connections.",
  "- Every component must have at least one connection. An isolated component with zero connections is always wrong.",
  "- Connections TO monitoring components must use dashed style (out-of-band log/telemetry flows).",
  "- Never use vague connection labels like 'Allowed Traffic', 'Traffic', or 'Filtered Telemetry'. Use specific protocol names (HTTPS, IPSec, syslog) or omit the label.",
  "- Security controls must connect to the workload or application they protect.",
  "- Use at most ONE labeled connection between any adjacent zone pair — combine or drop labels on secondary connections.",
  "",
  "ZONE ORDERING RULES (critical when adding new zones):",
  "- The zones array defines top-to-bottom rendering order. zone[0] renders at the top, the last zone renders at the bottom.",
  "- Entry-point zones (internet, users, external clients, perimeter, edge) must always appear at the TOP — insert them at the beginning of the zones array with lower order values than all existing zones.",
  "- Internal/application zones stay in the middle. Monitoring and operations zones stay at the bottom.",
  "- Set the 'order' field on every zone: renumber all zones sequentially (0, 1, 2, …) after any insertion so order matches array position.",
  "- Never append an entry-point zone at the end of the array — that places users below the data tier, which is architecturally wrong.",
];

// Auto-invalidates followup cache whenever the system prompt above changes.
export const FOLLOWUP_HASH = createHash("sha256")
  .update(FOLLOWUP_SYSTEM_PROMPT_LINES.join("\n"))
  .digest("hex")
  .slice(0, 8);

function getSignature(architecture: ArchitectureModel) {
  return JSON.stringify({
    zones: architecture.zones.map((zone) => zone.id),
    components: architecture.components.map(
      (component) => `${component.id}:${component.label}:${component.zoneId}:${component.type}`,
    ),
    connections: architecture.connections.map((connection) => `${connection.from}->${connection.to}:${connection.label ?? ""}`),
  });
}

export async function editArchitectureWithModel(
  architecture: ArchitectureModel,
  instruction: string,
): Promise<ArchitectureModel> {
  const client = getAnthropicClient();

  if (!client) {
    return applyFollowupInstruction(architecture, instruction);
  }

  try {
    const response = await client.messages.create({
      model: getGenerateModel(),
      max_tokens: 4096,
      temperature: 0.25,
      // cache_control marks the system prompt for Anthropic prompt caching.
      // Repeated followup calls within the 5-min cache window pay 10% of normal input cost.
      system: [
        {
          type: "text",
          text: FOLLOWUP_SYSTEM_PROMPT_LINES.join("\n"),
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            currentArchitecture: architecture,
            followUpInstruction: instruction,
          }),
        },
      ],
    });

    const block = response.content[0];
    const content = block?.type === "text" ? block.text : null;
    if (!content) {
      return applyFollowupInstruction(architecture, instruction);
    }

    const cleaned = content.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();
    let parsed: ReturnType<typeof refreshArchitectureText>;
    try {
      parsed = refreshArchitectureText(architectureSchema.parse(JSON.parse(cleaned)));
    } catch (parseErr) {
      console.error("[followup] Claude response failed parse/validation:", parseErr instanceof Error ? parseErr.message : parseErr);
      console.error("[followup] raw response (first 600 chars):", cleaned.slice(0, 600));
      return applyFollowupInstruction(architecture, instruction);
    }
    if (getSignature(parsed) === getSignature(architecture)) {
      console.error("[followup] Claude returned identical architecture — instruction may be too vague or conflicting with schema constraints");
      return applyFollowupInstruction(architecture, instruction);
    }
    return parsed;
  } catch (err) {
    console.error("[followup] unexpected error calling Claude:", err instanceof Error ? err.message : err);
    return applyFollowupInstruction(architecture, instruction);
  }
}

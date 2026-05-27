import type { ArchitectureModel } from "../../../shared/types/architecture.js";
import { architectureSchema } from "../schemas/architectureSchema.js";
import { getAnthropicClient, getGenerateModel } from "./anthropic.js";
import { applyFollowupInstruction, refreshArchitectureText } from "./architectureGenerator.js";

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
          text: [
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
          ].join("\n"),
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
    const parsed = refreshArchitectureText(architectureSchema.parse(JSON.parse(cleaned)));
    if (getSignature(parsed) === getSignature(architecture)) {
      return applyFollowupInstruction(architecture, instruction);
    }
    return parsed;
  } catch {
    return applyFollowupInstruction(architecture, instruction);
  }
}

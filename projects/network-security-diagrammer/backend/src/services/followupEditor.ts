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
      system: [
        "You update a network and security architecture model based on a follow-up instruction.",
        "Return only valid JSON with no markdown or code fences.",
        "Preserve the current architecture unless the instruction explicitly replaces part of it.",
        "Keep the result architect-level, simple, and vendor-neutral unless explicitly requested.",
        "Maintain 16 components max and 15 connections max whenever possible.",
      ].join(" "),
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

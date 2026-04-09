import type { ArchitectureModel } from "../../../shared/types/architecture.js";
import { architectureSchema } from "../schemas/architectureSchema.js";
import { getOpenAIClient, getOpenAIModel } from "./openai.js";
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
  const client = getOpenAIClient();

  if (!client) {
    return applyFollowupInstruction(architecture, instruction);
  }

  try {
    const response = await client.chat.completions.create({
      model: getOpenAIModel(),
      temperature: 0.25,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You update a network and security architecture model based on a follow-up instruction.",
            "Return only JSON.",
            "Preserve the current architecture unless the instruction explicitly replaces part of it.",
            "Keep the result architect-level, simple, and vendor-neutral unless explicitly requested.",
            "Maintain 16 components max and 15 connections max whenever possible.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            currentArchitecture: architecture,
            followUpInstruction: instruction,
          }),
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return applyFollowupInstruction(architecture, instruction);
    }

    const parsed = refreshArchitectureText(architectureSchema.parse(JSON.parse(content)));
    if (getSignature(parsed) === getSignature(architecture)) {
      return applyFollowupInstruction(architecture, instruction);
    }
    return parsed;
  } catch {
    return applyFollowupInstruction(architecture, instruction);
  }
}

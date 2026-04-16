import type {
  ArchitectureComponent,
  ArchitectureConnection,
  ArchitectureModel,
  ArchitectureZone,
} from "../../../shared/types/architecture.js";
import type { PromptAnalysis } from "../../../shared/types/analysis.js";
import { architectureSchema } from "../schemas/architectureSchema.js";
import { getOpenAIClient, getOpenAIModel } from "./openai.js";
import { classifyPromptPattern } from "./patternLibrary.js";

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function createZone(id: string, label: string, type: ArchitectureZone["type"]): ArchitectureZone {
  return { id, label, type };
}

function createComponent(
  label: string,
  type: ArchitectureComponent["type"],
  zoneId: string,
  importance: ArchitectureComponent["importance"] = "normal",
): ArchitectureComponent {
  return { id: slug(label), label, type, zoneId, importance };
}

function createConnection(
  from: string,
  to: string,
  label?: string,
  style: ArchitectureConnection["style"] = "solid",
): ArchitectureConnection {
  return { id: `${from}-${to}`, from, to, label, style };
}

function uniqueSlug(value: string, used: Set<string>, fallbackPrefix: string) {
  const base = slug(value) || fallbackPrefix;
  let candidate = base;
  let suffix = 2;

  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  used.add(candidate);
  return candidate;
}

function normalizeGeneratedArchitecture(architecture: ArchitectureModel) {
  const usedZoneIds = new Set<string>();
  const zones = architecture.zones.map((zone, index) => ({
    ...zone,
    id: uniqueSlug(zone.id || zone.label || `zone-${index + 1}`, usedZoneIds, `zone-${index + 1}`),
  }));

  if (zones.length === 0) {
    return null;
  }

  const zoneIdByNormalizedKey = new Map<string, string>();
  zones.forEach((zone) => {
    zoneIdByNormalizedKey.set(slug(zone.id), zone.id);
    zoneIdByNormalizedKey.set(slug(zone.label), zone.id);
  });

  const resolveZoneId = (value: string) =>
    zoneIdByNormalizedKey.get(slug(value)) ?? zones[0]!.id;

  const usedComponentIds = new Set<string>();
  const components = architecture.components.map((component, index) => ({
    ...component,
    id: uniqueSlug(component.id || component.label || `component-${index + 1}`, usedComponentIds, `component-${index + 1}`),
    zoneId: resolveZoneId(component.zoneId),
  }));

  if (components.length === 0) {
    return null;
  }

  const componentIdByNormalizedKey = new Map<string, string>();
  components.forEach((component) => {
    componentIdByNormalizedKey.set(slug(component.id), component.id);
    componentIdByNormalizedKey.set(slug(component.label), component.id);
  });

  const resolveComponentId = (value: string) => componentIdByNormalizedKey.get(slug(value));

  const connectionIds = new Set<string>();
  const connections = architecture.connections
    .map((connection) => {
      const from = resolveComponentId(connection.from);
      const to = resolveComponentId(connection.to);

      if (!from || !to || from === to) {
        return null;
      }

      const connectionBase = `${from}-${to}`;
      const id = uniqueSlug(connection.id || connectionBase, connectionIds, connectionBase);

      const normalizedConnection: ArchitectureConnection = {
        ...connection,
        id,
        from,
        to,
        style: connection.style ?? "solid",
      };

      return normalizedConnection;
    })
    .filter((connection): connection is ArchitectureConnection => Boolean(connection));

  if (connections.length === 0) {
    return null;
  }

  return {
    ...architecture,
    zones,
    components,
    connections,
  } satisfies ArchitectureModel;
}

async function generateArchitectureWithModel(
  prompt: string,
  analysis: PromptAnalysis,
  classification: ReturnType<typeof classifyPromptPattern>,
) {
  const client = getOpenAIClient();

  if (!client) {
    return null;
  }

  try {
    const response = await client.chat.completions.create({
      model: getOpenAIModel(),
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You generate a network and security architecture model for diagram rendering.",
            "Return only JSON.",
            "Keep the output conceptual, simple, and vendor-neutral unless the prompt explicitly names a vendor, provider, or product.",
            "Preserve explicit entities from the prompt such as AWS, Exchange, WAF, MFA, SSO, VPN, DMZ, or SIEM when present.",
            "Avoid generic zone-heavy diagrams unless the prompt truly calls for them.",
            "Target 2 to 4 zones, 6 to 12 components, and at most 15 connections.",
            "Use these zone types only: external, dmz, security-zone, internal, cloud, branch, data-center.",
            "Use these component types only: user, network, security-control, identity, application, data, monitoring, integration.",
            "Use connection styles only: solid or dashed.",
            "Provide stable ids as lowercase slugs.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            prompt,
            normalizedPrompt: analysis.normalizedPrompt,
            assumptions: analysis.assumptions,
            selectedPattern: classification.pattern,
            outputFormat: {
              title: "string",
              summary: "string",
              assumptions: ["string"],
              appliedChanges: [],
              zones: [{ id: "string", label: "string", type: "external|dmz|security-zone|internal|cloud|branch|data-center" }],
              components: [
                {
                  id: "string",
                  label: "string",
                  type: "user|network|security-control|identity|application|data|monitoring|integration",
                  zoneId: "string",
                  importance: "normal|critical",
                },
              ],
              connections: [{ id: "string", from: "string", to: "string", label: "string", style: "solid|dashed" }],
            },
          }),
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return null;
    }

    const parsed = architectureSchema.parse(JSON.parse(content));
    const normalized = normalizeGeneratedArchitecture({
      ...parsed,
      assumptions: analysis.assumptions,
      appliedChanges: [],
    });

    if (!normalized) {
      return null;
    }

    return refreshArchitectureText(normalized, { prompt, classification });
  } catch {
    return null;
  }
}

function shouldUseModelFallback(
  analysis: PromptAnalysis,
  classification: ReturnType<typeof classifyPromptPattern>,
) {
  return classification.pattern === "generic-secure-architecture" || classification.confidence < 0.8 || analysis.confidence < 0.75;
}

function deriveSummary(architecture: ArchitectureModel) {
  const hasComponent = (pattern: string) =>
    architecture.components.some((component) => component.label.toLowerCase().includes(pattern.toLowerCase()));

  if (architecture.title.includes("Partner API")) {
    return "Partner API traffic is authenticated and inspected at the edge, governed through an API management layer, and authorized through centralized identity and policy controls before reaching backend services.";
  }

  if (architecture.title.includes("Hybrid Identity and Cloud")) {
    return "On-prem identity services are synchronized into a cloud identity plane so cloud apps can enforce conditional access, MFA, and secure hybrid access patterns.";
  }

  if (architecture.title.includes("SSO and MFA") || architecture.title.includes("Identity Access")) {
    return "Users reach enterprise applications through a centralized identity platform that performs SSO, MFA, and token issuance before application access is granted.";
  }

  if (architecture.title.includes("Hybrid Connectivity")) {
    return "On-prem workloads connect securely into the cloud through protected connectivity and controlled edge gateways, preserving access to application and monitoring services across both environments.";
  }

  if (architecture.title.includes("Secure Remote Access")) {
    return "A remote user reaches internal business services through a VPN-based access path with encrypted transport, gateway enforcement, and identity validation.";
  }

  if (architecture.title.includes("Secure Messaging")) {
    return "Inbound mail is filtered in the DMZ by an email security appliance before controlled delivery into the internal Exchange environment and end-user clients.";
  }

  if (architecture.title.includes("WAF")) {
    return "Internet-facing application traffic is filtered through an on-prem WAF in the DMZ before it reaches reverse proxy, application, and data tiers in the trusted network.";
  }

  if (architecture.title.includes("DDoS")) {
    return "Attack traffic is scrubbed in a cloud mitigation layer before clean traffic is forwarded to the enterprise edge and protected internal services.";
  }

  if (architecture.title.includes("Wireless Network")) {
    return "Wireless users connect through a shared access point into separate SSID segments, with downstream network policy keeping private and guest access paths distinct.";
  }

  if (architecture.title.includes("Zero Trust")) {
    return "User and device access is brokered through identity, policy, and access proxy controls before any internal or SaaS application session is established.";
  }

  if (architecture.title.includes("Segmentation")) {
    return "Traffic is inspected and segmented before it reaches protected application, data, and monitoring zones, keeping the main enforcement path simple and visible.";
  }

  const zoneLabels = architecture.zones.map((zone) => zone.label).slice(0, 3);
  const controlLabels = architecture.components
    .filter((component) => component.type === "security-control" && component.importance === "critical")
    .map((component) => component.label)
    .slice(0, 2);

  const zoneText =
    zoneLabels.length >= 3 ? `${zoneLabels[0]}, ${zoneLabels[1]}, and ${zoneLabels[2]}` : zoneLabels.join(" and ");
  const controlText = controlLabels.length > 0 ? ` Primary controls include ${controlLabels.join(" and ")}.` : "";

  if (hasComponent("Gateway") || hasComponent("Firewall")) {
    return `Conceptual architecture spanning ${zoneText}.${controlText}`;
  }

  return `Conceptual architecture spanning ${zoneText}.`;
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function deriveTitle(
  architecture: ArchitectureModel,
  prompt?: string,
  classification?: ReturnType<typeof classifyPromptPattern>,
) {
  if (classification?.pattern === "partner-api-security") {
    return "Securing APIs Exposed to Business Partners";
  }

  if (classification?.pattern === "hybrid-identity-cloud") {
    return "Secure Hybrid Cloud with On-Prem AD and Cloud Apps";
  }

  if (classification?.pattern === "identity-access") {
    return "SSO and MFA Flow for Enterprise Apps";
  }

  if (classification?.pattern === "hybrid-connectivity") {
    if (classification.modifiers.includes("aws")) {
      return "Secure Hybrid Connectivity Between On-Prem and AWS";
    }
    if (classification.modifiers.includes("azure")) {
      return "Secure Hybrid Connectivity Between On-Prem and Azure";
    }
    if (classification.modifiers.includes("gcp")) {
      return "Secure Hybrid Connectivity Between On-Prem and GCP";
    }
    return "Secure Hybrid Connectivity";
  }

  if (classification?.pattern === "remote-access") {
    return "Remote User VPN Access to Office Applications";
  }

  if (classification?.pattern === "email-security") {
    if (promptMentions(prompt ?? "", ["exchange"])) {
      return "On-Prem Email Security for Exchange";
    }
    return "On-Prem Email Security Architecture";
  }

  if (classification?.pattern === "waf-dmz") {
    return "On-Prem WAF in a DMZ Network";
  }

  if (classification?.pattern === "ddos-protection") {
    return "Enterprise DDoS Protection with Cloud Scrubbing";
  }

  if (classification?.pattern === "wireless-network") {
    return "Wi-Fi Network with Separate SSIDs";
  }

  if (classification?.pattern === "zero-trust") {
    return "Zero Trust Access Architecture";
  }

  if (classification?.pattern === "segmentation") {
    return "Segmentation and Inspection Architecture";
  }

  if (classification?.pattern === "logging-siem") {
    return "Centralized Logging and SIEM Architecture";
  }

  if (classification?.pattern === "sandbox-analysis") {
    return "Threat Analysis Sandbox Architecture";
  }

  if (prompt) {
    const cleaned = prompt
      .trim()
      .replace(/^(show|design|how to)\s+/i, "")
      .replace(/[.?!]+$/, "");
    if (cleaned.length > 0) {
      return titleCase(cleaned);
    }
  }

  return architecture.title;
}

export function refreshArchitectureText(
  architecture: ArchitectureModel,
  options?: {
    prompt?: string;
    classification?: ReturnType<typeof classifyPromptPattern>;
  },
): ArchitectureModel {
  return {
    ...architecture,
    assumptions: architecture.assumptions ?? [],
    appliedChanges: (architecture.appliedChanges ?? []).slice(-8),
    title: deriveTitle(architecture, options?.prompt, options?.classification),
    summary: deriveSummary(architecture),
  };
}

function promptMentions(prompt: string, terms: string[]) {
  const lower = prompt.toLowerCase();
  return terms.some((term) => lower.includes(term.toLowerCase()));
}

function deriveWirelessSsidLabels(prompt: string) {
  const lower = prompt.toLowerCase();
  const labels: string[] = [];

  if (/\bguest\b/.test(lower)) {
    labels.push("Guest Wi-Fi");
  }

  if (/\b(employee|corporate|internal|staff)\b/.test(lower)) {
    labels.push("Internal Corporate");
  }

  const countMatch = lower.match(/\b([2-4])\s+(?:separate\s+)?ssids?\b/);
  const requestedCount = countMatch ? Number.parseInt(countMatch[1] ?? "0", 10) : 0;

  if (labels.length === 0 && requestedCount >= 2) {
    labels.push("Internal Corporate", "Guest Wi-Fi");
  }

  if (labels.length === 1 && requestedCount >= 2) {
    labels.push(labels[0] === "Guest Wi-Fi" ? "Internal Corporate" : "Guest Wi-Fi");
  }

  if (labels.length === 0) {
    labels.push("SSID 1", "SSID 2");
  }

  return labels.slice(0, Math.max(2, requestedCount || labels.length));
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function toTokens(value: string) {
  return normalizeText(value)
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function levenshteinDistance(left: string, right: string) {
  if (left === right) {
    return 0;
  }

  const rows = left.length + 1;
  const cols = right.length + 1;
  const matrix = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let row = 0; row < rows; row += 1) {
    matrix[row]![0] = row;
  }

  for (let col = 0; col < cols; col += 1) {
    matrix[0]![col] = col;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      matrix[row]![col] = Math.min(
        matrix[row - 1]![col]! + 1,
        matrix[row]![col - 1]! + 1,
        matrix[row - 1]![col - 1]! + cost,
      );
    }
  }

  return matrix[rows - 1]![cols - 1]!;
}

function tokensLooselyMatch(left: string, right: string) {
  if (left === right) {
    return true;
  }

  if (left.startsWith(right) || right.startsWith(left)) {
    return true;
  }

  if (left.length >= 4 && right.length >= 4 && left.slice(0, 4) === right.slice(0, 4)) {
    return true;
  }

  return levenshteinDistance(left, right) <= 1;
}

function scoreTokenOverlap(targetTokens: string[], labelTokens: string[]) {
  let score = 0;

  for (const targetToken of targetTokens) {
    if (labelTokens.some((labelToken) => tokensLooselyMatch(targetToken, labelToken))) {
      score += 1;
    }
  }

  return score;
}

function extractRemovalTarget(instruction: string) {
  const match = instruction.match(/\b(?:remove|delete|drop|without)\b\s+(.+)/i);
  if (!match) {
    return "";
  }

  return match[1]
    .replace(/^(?:the|a|an)\s+/i, "")
    .replace(/\b(?:from|in|on)\b.+$/i, "")
    .replace(/\b(?:please|now)\b/gi, "")
    .trim();
}

function extractRenameTargets(instruction: string) {
  const patterns = [
    /\b(?:rename|change)\b\s+(.+?)\s+\bto\b\s+(.+)/i,
    /\b(?:replace)\b\s+(.+?)\s+\bwith\b\s+(.+)/i,
  ];

  for (const pattern of patterns) {
    const match = instruction.match(pattern);
    if (match) {
      return {
        from: (match[1] ?? "").replace(/^(?:the|a|an)\s+/i, "").trim(),
        to: (match[2] ?? "").replace(/^(?:the|a|an)\s+/i, "").trim(),
      };
    }
  }

  return null;
}

function findComponentByInstruction(components: ArchitectureComponent[], instruction: string) {
  const target = extractRemovalTarget(instruction);
  if (!target) {
    return undefined;
  }

  const normalizedTarget = normalizeText(target);
  const targetTokens = toTokens(target);
  if (targetTokens.length === 0) {
    return undefined;
  }

  const ranked = components
    .map((component) => {
      const label = normalizeText(component.label);
      const labelTokens = toTokens(component.label);
      const overlap = targetTokens.filter((token) => labelTokens.includes(token)).length;
      let score = overlap * 10;

      if (label === normalizedTarget) {
        score += 100;
      }

      if (label.includes(normalizedTarget)) {
        score += 40;
      }

      if (component.id === slug(target)) {
        score += 30;
      }

      return { component, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.component;
}

function findComponentByLabel(components: ArchitectureComponent[], label: string) {
  const normalizedTarget = normalizeText(label);
  const targetTokens = toTokens(label);
  if (!normalizedTarget || targetTokens.length === 0) {
    return undefined;
  }

  const ranked = components
    .map((component) => {
      const componentLabel = normalizeText(component.label);
      const labelTokens = toTokens(component.label);
      const overlap = scoreTokenOverlap(targetTokens, labelTokens);
      let score = overlap * 10;

      if (componentLabel === normalizedTarget) {
        score += 100;
      }

      if (componentLabel.includes(normalizedTarget)) {
        score += 40;
      }

      if (component.id === slug(label)) {
        score += 30;
      }

      return { component, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.component;
}

function renameComponent(architecture: ArchitectureModel, currentLabel: string, nextLabel: string) {
  const component = findComponentByLabel(architecture.components, currentLabel);
  if (!component || !nextLabel.trim()) {
    return false;
  }

  const oldId = component.id;
  const newId = slug(nextLabel);

  component.label = nextLabel.trim();
  component.id = newId;

  architecture.connections = architecture.connections.map((connection) => {
    const from = connection.from === oldId ? newId : connection.from;
    const to = connection.to === oldId ? newId : connection.to;
    return {
      ...connection,
      from,
      to,
      id: `${from}-${to}`,
    };
  });

  return true;
}

function rewireAroundComponent(architecture: ArchitectureModel, componentId: string) {
  const incoming = architecture.connections.filter((connection) => connection.to === componentId);
  const outgoing = architecture.connections.filter((connection) => connection.from === componentId);
  const remaining = architecture.connections.filter(
    (connection) => connection.from !== componentId && connection.to !== componentId,
  );

  for (const source of incoming) {
    for (const destination of outgoing) {
      if (source.from === destination.to) {
        continue;
      }

      const connectionId = `${source.from}-${destination.to}`;
      if (remaining.some((connection) => connection.id === connectionId)) {
        continue;
      }

      remaining.push(
        createConnection(
          source.from,
          destination.to,
          destination.label ?? source.label,
          source.style === "dashed" && destination.style === "dashed" ? "dashed" : "solid",
        ),
      );
    }
  }

  architecture.connections = remaining;
}

function buildScenarioArchitecture(
  prompt: string,
  analysis: PromptAnalysis,
  classification = classifyPromptPattern(analysis.normalizedPrompt),
): ArchitectureModel {

  if (classification.pattern === "partner-api-security") {
    return refreshArchitectureText({
      title: "Partner API Security Pattern",
      summary: "",
      assumptions: analysis.assumptions,
      appliedChanges: [],
      zones: [
        createZone("partner", "Partner Infrastructure", "external"),
        createZone("edge", "Security Perimeter and Edge", "security-zone"),
        createZone("api", "API Management Layer", "internal"),
        createZone("identity", "Identity and Access Management", "internal"),
        createZone("backend", "Backend Services", "internal"),
      ],
      components: [
        createComponent("Partner Application", "application", "partner"),
        createComponent("Partner Admin Portal", "application", "partner"),
        createComponent("mTLS Termination", "security-control", "edge", "critical"),
        createComponent("Web Application Firewall", "security-control", "edge", "critical"),
        createComponent("DDoS Protection", "security-control", "edge"),
        createComponent("API Gateway", "network", "api", "critical"),
        createComponent("Rate Limiting and Quota", "security-control", "api"),
        createComponent("API Key / Secret Management", "identity", "api"),
        createComponent("OAuth2 / OIDC Server", "identity", "identity", "critical"),
        createComponent("Partner Identity Provider", "identity", "identity"),
        createComponent("Scope and Policy Engine", "security-control", "identity"),
        createComponent("Business Logic API", "application", "backend"),
        createComponent("Encrypted Database", "data", "backend"),
        createComponent("Audit and Monitoring", "monitoring", "backend"),
      ],
      connections: [
        createConnection("partner-application", "mtls-termination", "Certificate Exchange"),
        createConnection("mtls-termination", "web-application-firewall", "Request Traffic"),
        createConnection("web-application-firewall", "api-gateway", "Clean Traffic"),
        createConnection("api-gateway", "oauth2-oidc-server", "Validate Token / Key"),
        createConnection("api-gateway", "rate-limiting-and-quota", "Apply Policies"),
        createConnection("api-gateway", "api-key-secret-management"),
        createConnection("api-gateway", "business-logic-api", "Authorized Request"),
        createConnection("business-logic-api", "encrypted-database", "Data Access"),
        createConnection("business-logic-api", "audit-and-monitoring", "Log Transaction"),
        createConnection("partner-admin-portal", "oauth2-oidc-server", "Request Credentials"),
        createConnection("oauth2-oidc-server", "partner-identity-provider", "Federate Trust"),
        createConnection("oauth2-oidc-server", "scope-and-policy-engine", "Token Introspection"),
      ],
    }, { prompt, classification });
  }

  if (classification.pattern === "hybrid-identity-cloud") {
    return refreshArchitectureText({
      title: "Hybrid Identity and Cloud Pattern",
      summary: "",
      assumptions: analysis.assumptions,
      appliedChanges: [],
      zones: [
        createZone("cloud", "Cloud Service Provider", "cloud"),
        createZone("identity", "Identity and Access Management", "security-zone"),
        createZone("onprem", "On-Premises Data Center", "data-center"),
      ],
      components: [
        createComponent("Internet Gateway", "network", "cloud"),
        createComponent("Web Application Firewall", "security-control", "cloud"),
        createComponent("Custom Cloud App", "application", "cloud"),
        createComponent("SaaS Application", "application", "cloud"),
        createComponent("Private Link / Endpoints", "network", "cloud"),
        createComponent("Conditional Access Policies", "security-control", "identity"),
        createComponent("Multi-Factor Authentication", "identity", "identity"),
        createComponent("Identity Protection", "security-control", "identity"),
        createComponent("Cloud Identity Platform", "identity", "identity", "critical"),
        createComponent("Active Directory Domain Services", "identity", "onprem"),
        createComponent("Cloud Sync Connector", "identity", "onprem"),
        createComponent("Legacy Internal Applications", "application", "onprem"),
        createComponent("RADIUS / NPS Server", "identity", "onprem"),
        createComponent("Corporate Firewall", "security-control", "onprem"),
        createComponent("Site-to-Site VPN / ExpressRoute", "security-control", "onprem", "critical"),
      ],
      connections: [
        createConnection("internet-gateway", "web-application-firewall"),
        createConnection("web-application-firewall", "custom-cloud-app"),
        createConnection("cloud-identity-platform", "custom-cloud-app", "SSO / SAML / OIDC"),
        createConnection("cloud-identity-platform", "saas-application", "SSO / SAML / OIDC"),
        createConnection("cloud-identity-platform", "private-link-endpoints", "App Proxy / Access"),
        createConnection("conditional-access-policies", "cloud-identity-platform", "Evaluate"),
        createConnection("multi-factor-authentication", "cloud-identity-platform", "Verify"),
        createConnection("identity-protection", "cloud-identity-platform", "Monitor"),
        createConnection("active-directory-domain-services", "cloud-sync-connector", "Identity Synchronization"),
        createConnection("cloud-sync-connector", "cloud-identity-platform", "Sync"),
        createConnection("legacy-internal-applications", "cloud-identity-platform", "App Connector"),
        createConnection("corporate-firewall", "site-to-site-vpn-expressroute"),
      ],
    }, { prompt, classification });
  }

  if (classification.pattern === "identity-access") {
    return refreshArchitectureText({
      title: "Identity Access Pattern",
      summary: "",
      assumptions: analysis.assumptions,
      appliedChanges: [],
      zones: [
        createZone("users", "Users", "external"),
        createZone("identity", "Identity Platform", "security-zone"),
        createZone("apps", "Enterprise Applications", "internal"),
      ],
      components: [
        createComponent("Users", "user", "users"),
        createComponent("User Device / Browser", "network", "users"),
        createComponent("Identity Provider", "identity", "identity", "critical"),
        createComponent("SSO Portal", "identity", "identity", "critical"),
        createComponent("MFA Service", "identity", "identity", "critical"),
        createComponent("Token / Session Service", "identity", "identity"),
        createComponent("Enterprise Application", "application", "apps", "critical"),
        createComponent("SaaS / Internal Apps", "application", "apps"),
      ],
      connections: [
        createConnection("users", "user-device-browser"),
        createConnection("user-device-browser", "sso-portal", "Access Request"),
        createConnection("sso-portal", "identity-provider", "Authenticate"),
        createConnection("identity-provider", "mfa-service", "Step-Up Verification"),
        createConnection("mfa-service", "token-session-service", "Approved Session"),
        createConnection("token-session-service", "enterprise-application", "SSO Assertion / Token"),
        createConnection("token-session-service", "saas-internal-apps", "SSO Assertion / Token"),
      ],
    }, { prompt, classification });
  }

  if (classification.pattern === "wireless-network") {
    const ssidLabels = deriveWirelessSsidLabels(prompt);
    const guestLabel = ssidLabels[1] ?? "Guest Wi-Fi";
    const corporateLabel = ssidLabels[0] ?? "Internal Corporate";

    return refreshArchitectureText({
      title: "Wireless Network Segmentation Pattern",
      summary: "",
      assumptions: analysis.assumptions,
      appliedChanges: [],
      zones: [
        createZone("upstream", "Upstream Network", "external"),
        createZone("wireless", "Wireless Access", "security-zone"),
        createZone("policy", "Network Policy", "internal"),
      ],
      components: [
        createComponent("Internet", "network", "upstream"),
        createComponent("Main Router", "network", "upstream"),
        createComponent("Dual-Band Access Point", "network", "wireless", "critical"),
        createComponent(`${corporateLabel} SSID`, "network", "wireless"),
        createComponent("Employee Devices", "user", "wireless"),
        createComponent(`${guestLabel} SSID`, "network", "wireless"),
        createComponent("Guest Devices", "user", "wireless"),
        createComponent("Private VLAN", "network", "policy"),
        createComponent("Internet-Only VLAN", "network", "policy"),
      ],
      connections: [
        createConnection("internet", "main-router"),
        createConnection("main-router", "dual-band-access-point"),
        createConnection("dual-band-access-point", `${slug(corporateLabel)}-ssid`, "Corporate SSID"),
        createConnection("dual-band-access-point", `${slug(guestLabel)}-ssid`, "Guest SSID"),
        createConnection(`${slug(corporateLabel)}-ssid`, "employee-devices"),
        createConnection(`${slug(guestLabel)}-ssid`, "guest-devices"),
        createConnection(`${slug(corporateLabel)}-ssid`, "private-vlan", "Private Access"),
        createConnection(`${slug(guestLabel)}-ssid`, "internet-only-vlan", "Internet Only"),
      ],
    }, { prompt, classification });
  }

  if (classification.pattern === "sandbox-analysis") {
    return refreshArchitectureText({
      title: "Threat Analysis Sandbox Pattern",
      summary: "",
      assumptions: analysis.assumptions,
      appliedChanges: [],
      zones: [
        createZone("sources", "Telemetry Sources", "external"),
        createZone("inspection", "Inspection Layer", "security-zone"),
        createZone("operations", "Operations Layer", "internal"),
      ],
      components: [
        createComponent("Email Security Source", "integration", "sources"),
        createComponent("Network Security Source", "integration", "sources"),
        createComponent("Security Operations Source", "integration", "sources"),
        createComponent("Submission Gateway", "security-control", "inspection", "critical"),
        createComponent("File Analysis Sandbox", "security-control", "inspection", "critical"),
        createComponent("Verdict Engine", "security-control", "inspection"),
        createComponent("Alerting / Case Output", "monitoring", "operations"),
        createComponent("Policy / Response Workflow", "integration", "operations"),
      ],
      connections: [
        createConnection("email-security-source", "submission-gateway", "Suspicious Files"),
        createConnection("network-security-source", "submission-gateway", "Suspicious Files"),
        createConnection("security-operations-source", "submission-gateway", "Manual / Automated Submit"),
        createConnection("submission-gateway", "file-analysis-sandbox"),
        createConnection("file-analysis-sandbox", "verdict-engine", "Behavioral Results"),
        createConnection("verdict-engine", "alerting-case-output", "Findings"),
        createConnection("verdict-engine", "policy-response-workflow", "Recommended Action"),
      ],
    }, { prompt, classification });
  }

  if (classification.pattern === "remote-access") {
    return refreshArchitectureText({
      title: "Secure Remote Access Pattern",
      summary: "",
      assumptions: analysis.assumptions,
      appliedChanges: [],
      zones: [
        createZone("home", "Home Environment", "external"),
        createZone("internet", "Public Internet", "external"),
        createZone("internal", "Internal Environment", "internal"),
      ],
      components: [
        createComponent("Remote User", "user", "home"),
        createComponent("Endpoint Access Client", "security-control", "home", "critical"),
        createComponent("User Device", "network", "home"),
        createComponent("Local Gateway", "network", "home"),
        createComponent("Encrypted Tunnel", "security-control", "internet", "critical"),
        createComponent("Perimeter Firewall", "security-control", "internal", "critical"),
        createComponent("Secure Access Gateway", "security-control", "internal", "critical"),
        createComponent("Internal Network", "network", "internal"),
        createComponent("Business Application", "application", "internal"),
        createComponent("Identity Service", "identity", "internal"),
      ],
      connections: [
        createConnection("remote-user", "endpoint-access-client"),
        createConnection("remote-user", "user-device"),
        createConnection("endpoint-access-client", "local-gateway"),
        createConnection("local-gateway", "encrypted-tunnel", "Protected Access"),
        createConnection("encrypted-tunnel", "perimeter-firewall"),
        createConnection("perimeter-firewall", "secure-access-gateway"),
        createConnection("secure-access-gateway", "internal-network"),
        createConnection("internal-network", "business-application"),
        createConnection("secure-access-gateway", "identity-service", "Identity Check"),
      ],
    }, { prompt, classification });
  }

  if (classification.pattern === "email-security") {
    const explicitExchange = promptMentions(prompt, ["exchange"]);
    const explicitAppliance = promptMentions(prompt, ["appliance", "email security appliance"]);

    return refreshArchitectureText({
      title: "Secure Messaging Protection Pattern",
      summary: "",
      assumptions: analysis.assumptions,
      appliedChanges: [],
      zones: [
        createZone("internet", "Internet", "external"),
        createZone("dmz", "DMZ", "dmz"),
        createZone("internal", "Internal Network", "internal"),
        createZone("clients", "End User Clients", "internal"),
      ],
      components: [
        createComponent("External Sender", "user", "internet"),
        createComponent("External Firewall", "security-control", "dmz", "critical"),
        createComponent(explicitAppliance ? "Email Security Appliance" : "Message Security Gateway", "security-control", "dmz", "critical"),
        createComponent("Internal Firewall", "security-control", "internal", "critical"),
        createComponent(explicitExchange ? "Exchange Email Server" : "Internal Messaging Service", "application", "internal", "critical"),
        createComponent(explicitExchange ? "Active Directory" : "Identity Directory", "identity", "internal"),
        createComponent(explicitExchange ? "Mailbox Database" : "Message Store", "data", "internal"),
        createComponent("Outlook Desktop", "user", "clients"),
        createComponent("Mobile Client", "user", "clients"),
        createComponent("Web Mail Access", "user", "clients"),
      ],
      connections: [
        createConnection("external-sender", "external-firewall", "SMTP"),
        createConnection("external-firewall", explicitAppliance ? "email-security-appliance" : "message-security-gateway", "Filtered Traffic"),
        createConnection(
          explicitAppliance ? "email-security-appliance" : "message-security-gateway",
          "internal-firewall",
          "Clean Traffic",
        ),
        createConnection(
          "internal-firewall",
          explicitExchange ? "exchange-email-server" : "internal-messaging-service",
          "Approved Delivery",
        ),
        createConnection(
          explicitExchange ? "exchange-email-server" : "internal-messaging-service",
          explicitExchange ? "active-directory" : "identity-directory",
          "Directory Lookup",
        ),
        createConnection(
          explicitExchange ? "exchange-email-server" : "internal-messaging-service",
          explicitExchange ? "mailbox-database" : "message-store",
          "Mailbox Data",
        ),
        createConnection(explicitExchange ? "exchange-email-server" : "internal-messaging-service", "outlook-desktop", "MAPI / HTTPS"),
        createConnection(explicitExchange ? "exchange-email-server" : "internal-messaging-service", "mobile-client", "ActiveSync"),
        createConnection(explicitExchange ? "exchange-email-server" : "internal-messaging-service", "web-mail-access", "HTTPS"),
      ],
    }, { prompt, classification });
  }

  if (classification.pattern === "ddos-protection") {
    return refreshArchitectureText({
      title: "DDoS Protection Pattern",
      summary: "",
      assumptions: analysis.assumptions,
      appliedChanges: [],
      zones: [
        createZone("internet", "Public Internet", "external"),
        createZone("scrubbing", "Traffic Scrubbing Layer", "cloud"),
        createZone("edge", "Network Edge", "security-zone"),
        createZone("internal", "Internal Services", "internal"),
      ],
      components: [
        createComponent("Legitimate Users", "user", "internet"),
        createComponent("Attack Traffic", "network", "internet", "critical"),
        createComponent("Traffic Redirection", "network", "scrubbing", "critical"),
        createComponent("Traffic Analysis", "security-control", "scrubbing"),
        createComponent("Mitigation Engine", "security-control", "scrubbing", "critical"),
        createComponent("Clean Traffic Tunnel", "security-control", "scrubbing"),
        createComponent("Edge Router", "network", "edge"),
        createComponent("Edge Protection Appliance", "security-control", "edge"),
        createComponent("Telemetry Collector", "monitoring", "edge"),
        createComponent("Internal Firewall", "security-control", "internal"),
        createComponent("Application Entry Point", "network", "internal"),
        createComponent("Application Tier", "application", "internal"),
        createComponent("Data Tier", "data", "internal"),
      ],
      connections: [
        createConnection("legitimate-users", "traffic-redirection"),
        createConnection("attack-traffic", "traffic-redirection"),
        createConnection("traffic-redirection", "traffic-analysis"),
        createConnection("traffic-analysis", "mitigation-engine"),
        createConnection("mitigation-engine", "clean-traffic-tunnel", "Clean Traffic"),
        createConnection("clean-traffic-tunnel", "edge-router"),
        createConnection("edge-router", "edge-protection-appliance", "Telemetry", "dashed"),
        createConnection("edge-router", "telemetry-collector", "Flow Stats", "dashed"),
        createConnection("edge-router", "internal-firewall"),
        createConnection("internal-firewall", "application-entry-point"),
        createConnection("application-entry-point", "application-tier"),
        createConnection("application-tier", "data-tier"),
      ],
    }, { prompt, classification });
  }

  if (classification.pattern === "hybrid-connectivity") {
    const explicitAws = classification.modifiers.includes("aws");
    const explicitAzure = classification.modifiers.includes("azure");
    const explicitGcp = classification.modifiers.includes("gcp");
    const cloudLabel = explicitAws
      ? "AWS Environment"
      : explicitAzure
        ? "Azure Environment"
        : explicitGcp
          ? "GCP Environment"
          : "Cloud Environment";
    const appLabel = explicitAws ? "AWS Application Tier" : explicitAzure ? "Azure Application Tier" : explicitGcp ? "GCP Application Tier" : "Cloud Application Tier";
    const networkLabel = explicitAws ? "AWS VPC" : explicitAzure ? "Azure Virtual Network" : explicitGcp ? "GCP VPC" : "Cloud Virtual Network";

    return refreshArchitectureText({
      title: "Hybrid Connectivity Pattern",
      summary: "",
      assumptions: analysis.assumptions,
      appliedChanges: [],
      zones: [
        createZone("onprem", "On-Prem Data Center", "data-center"),
        createZone("connectivity", "Secure Connectivity", "security-zone"),
        createZone("cloud", cloudLabel, "cloud"),
      ],
      components: [
        createComponent("On-Prem Core Network", "network", "onprem"),
        createComponent("On-Prem Application Segment", "application", "onprem"),
        createComponent("Identity / Directory", "identity", "onprem"),
        createComponent("Connectivity Gateway", "security-control", "connectivity", "critical"),
        createComponent("Encrypted Tunnel", "security-control", "connectivity", "critical"),
        createComponent("Cloud Edge Gateway", "security-control", "cloud", "critical"),
        createComponent(networkLabel, "network", "cloud"),
        createComponent(appLabel, "application", "cloud"),
        createComponent("Shared Monitoring", "monitoring", "cloud"),
      ],
      connections: [
        createConnection("on-prem-core-network", "on-prem-application-segment"),
        createConnection("identity-directory", "on-prem-application-segment", "Policy"),
        createConnection("on-prem-core-network", "connectivity-gateway"),
        createConnection("connectivity-gateway", "encrypted-tunnel", "Protected Connectivity"),
        createConnection("encrypted-tunnel", "cloud-edge-gateway"),
        createConnection("cloud-edge-gateway", slug(networkLabel)),
        createConnection(slug(networkLabel), slug(appLabel)),
        createConnection("cloud-edge-gateway", "shared-monitoring", "Telemetry", "dashed"),
      ],
    }, { prompt, classification });
  }

  if (classification.pattern === "waf-dmz") {
    return refreshArchitectureText({
      title: "WAF in DMZ Pattern",
      summary: "",
      assumptions: analysis.assumptions,
      appliedChanges: [],
      zones: [
        createZone("internet", "Public Internet", "external"),
        createZone("edge", "External Network Zone", "security-zone"),
        createZone("dmz", "DMZ", "dmz"),
        createZone("internal", "Internal Trusted Network", "internal"),
      ],
      components: [
        createComponent("External Users / Clients", "user", "internet"),
        createComponent("Malicious Actors", "user", "internet"),
        createComponent("External Router", "network", "edge"),
        createComponent("External Firewall", "security-control", "edge", "critical"),
        createComponent("On-Prem WAF Appliance", "security-control", "dmz", "critical"),
        createComponent("Load Balancer", "network", "dmz"),
        createComponent("Reverse Proxy Server", "network", "dmz"),
        createComponent("Internal Firewall", "security-control", "internal", "critical"),
        createComponent("Application Server Cluster", "application", "internal"),
        createComponent("Database Server", "data", "internal"),
        createComponent("Security Management Console", "monitoring", "internal"),
      ],
      connections: [
        createConnection("external-users-clients", "external-router"),
        createConnection("malicious-actors", "external-router"),
        createConnection("external-router", "external-firewall"),
        createConnection("external-firewall", "on-prem-waf-appliance"),
        createConnection("on-prem-waf-appliance", "load-balancer", "Inspected Traffic"),
        createConnection("load-balancer", "reverse-proxy-server"),
        createConnection("reverse-proxy-server", "internal-firewall"),
        createConnection("internal-firewall", "application-server-cluster"),
        createConnection("application-server-cluster", "database-server"),
        createConnection("on-prem-waf-appliance", "security-management-console", "Logs / Alerts", "dashed"),
        createConnection("security-management-console", "on-prem-waf-appliance", "Policy Updates", "dashed"),
      ],
    }, { prompt, classification });
  }

  if (classification.pattern === "ndr-visibility") {
    return refreshArchitectureText({
      title: "NDR Visibility Pattern",
      summary: "",
      assumptions: analysis.assumptions,
      appliedChanges: [],
      zones: [
        createZone("dmz", "DMZ", "dmz"),
        createZone("core", "Core Network", "security-zone"),
        createZone("server", "Server Farm", "internal"),
      ],
      components: [
        createComponent("DMZ Traffic", "network", "dmz"),
        createComponent("Core Traffic", "network", "core"),
        createComponent("Server Farm Traffic", "network", "server"),
        createComponent("Network Sensors", "security-control", "core", "critical"),
        createComponent("Traffic Mirror / TAP", "network", "core"),
        createComponent("NDR Analytics Platform", "security-control", "server", "critical"),
        createComponent("Alerting / SOC", "monitoring", "server"),
      ],
      connections: [
        createConnection("dmz-traffic", "traffic-mirror-tap", "Mirrored Traffic", "dashed"),
        createConnection("core-traffic", "traffic-mirror-tap", "Mirrored Traffic", "dashed"),
        createConnection("server-farm-traffic", "traffic-mirror-tap", "Mirrored Traffic", "dashed"),
        createConnection("traffic-mirror-tap", "network-sensors"),
        createConnection("network-sensors", "ndr-analytics-platform", "Telemetry"),
        createConnection("ndr-analytics-platform", "alerting-soc", "Findings"),
      ],
    }, { prompt, classification });
  }

  if (classification.pattern === "branch-networking") {
    return refreshArchitectureText({
      title: "Branch Networking Pattern",
      summary: "",
      assumptions: analysis.assumptions,
      appliedChanges: [],
      zones: [
        createZone("branch", "Branch Sites", "branch"),
        createZone("wan", "Secure WAN / SD-WAN", "security-zone"),
        createZone("hub", "HQ / Data Center", "data-center"),
      ],
      components: [
        createComponent("Branch Users", "user", "branch"),
        createComponent("Branch Router / Edge", "network", "branch"),
        createComponent("Local Security Control", "security-control", "branch", "critical"),
        createComponent("Overlay / Secure WAN", "network", "wan", "critical"),
        createComponent("Central Security Gateway", "security-control", "hub", "critical"),
        createComponent("Core Services", "application", "hub"),
        createComponent("Central Monitoring", "monitoring", "hub"),
      ],
      connections: [
        createConnection("branch-users", "branch-router-edge"),
        createConnection("branch-router-edge", "local-security-control"),
        createConnection("local-security-control", "overlay-secure-wan", "Secure Connectivity"),
        createConnection("overlay-secure-wan", "central-security-gateway"),
        createConnection("central-security-gateway", "core-services"),
        createConnection("central-security-gateway", "central-monitoring", "Telemetry", "dashed"),
      ],
    }, { prompt, classification });
  }

  if (classification.pattern === "logging-siem") {
    return refreshArchitectureText({
      title: "Centralized Logging Pattern",
      summary: "",
      assumptions: analysis.assumptions,
      appliedChanges: [],
      zones: [
        createZone("sources", "Security / Infrastructure Sources", "external"),
        createZone("collection", "Collection Layer", "security-zone"),
        createZone("operations", "Monitoring Operations", "internal"),
      ],
      components: [
        createComponent("Security Controls", "security-control", "sources"),
        createComponent("Infrastructure Devices", "network", "sources"),
        createComponent("Application Logs", "application", "sources"),
        createComponent("Log Collector", "monitoring", "collection", "critical"),
        createComponent("Normalization / Parsing", "monitoring", "collection"),
        createComponent("SIEM Platform", "monitoring", "operations", "critical"),
        createComponent("SOC Workflow", "integration", "operations"),
      ],
      connections: [
        createConnection("security-controls", "log-collector", "Logs", "dashed"),
        createConnection("infrastructure-devices", "log-collector", "Logs", "dashed"),
        createConnection("application-logs", "log-collector", "Logs", "dashed"),
        createConnection("log-collector", "normalization-parsing"),
        createConnection("normalization-parsing", "siem-platform"),
        createConnection("siem-platform", "soc-workflow", "Alerts"),
      ],
    }, { prompt, classification });
  }

  if (classification.pattern === "zero-trust") {
    return refreshArchitectureText({
      title: "Zero Trust Access Pattern",
      summary: "",
      assumptions: analysis.assumptions,
      appliedChanges: [],
      zones: [
        createZone("users", "Users / Devices", "external"),
        createZone("control", "Identity and Policy", "security-zone"),
        createZone("apps", "Applications", "internal"),
      ],
      components: [
        createComponent("Users", "user", "users"),
        createComponent("Managed Devices", "network", "users"),
        createComponent("Identity Platform", "identity", "control", "critical"),
        createComponent("Policy Decision Point", "security-control", "control", "critical"),
        createComponent("Access Proxy", "security-control", "control", "critical"),
        createComponent("Internal Apps", "application", "apps"),
        createComponent("SaaS Apps", "application", "apps"),
      ],
      connections: [
        createConnection("users", "managed-devices"),
        createConnection("managed-devices", "identity-platform", "Authenticate"),
        createConnection("identity-platform", "policy-decision-point", "Context"),
        createConnection("policy-decision-point", "access-proxy", "Access Decision"),
        createConnection("access-proxy", "internal-apps"),
        createConnection("access-proxy", "saas-apps"),
      ],
    }, { prompt, classification });
  }

  if (classification.pattern === "cloud-workload") {
    return refreshArchitectureText({
      title: "Cloud Workload Protection Pattern",
      summary: "",
      assumptions: analysis.assumptions,
      appliedChanges: [],
      zones: [
        createZone("cloud", "Cloud Environment", "cloud"),
        createZone("control", "Security Control Layer", "security-zone"),
        createZone("ops", "Operations", "internal"),
      ],
      components: [
        createComponent("Cloud Workloads", "application", "cloud"),
        createComponent("Data Services", "data", "cloud"),
        createComponent("Workload Protection", "security-control", "control", "critical"),
        createComponent("Identity / Secrets", "identity", "control"),
        createComponent("Telemetry / Logs", "monitoring", "control"),
        createComponent("Security Operations", "monitoring", "ops"),
      ],
      connections: [
        createConnection("workload-protection", "cloud-workloads", "Protection"),
        createConnection("identity-secrets", "cloud-workloads", "Identity"),
        createConnection("cloud-workloads", "data-services"),
        createConnection("cloud-workloads", "telemetry-logs", "Telemetry", "dashed"),
        createConnection("telemetry-logs", "security-operations"),
      ],
    }, { prompt, classification });
  }

  if (classification.pattern === "segmentation") {
    return refreshArchitectureText({
      title: "Segmentation and Inspection Pattern",
      summary: "",
      assumptions: analysis.assumptions,
      appliedChanges: [],
      zones: [
        createZone("edge", "External / User Zone", "external"),
        createZone("policy", "Inspection and Segmentation", "security-zone"),
        createZone("internal", "Protected Internal Zones", "internal"),
      ],
      components: [
        createComponent("Users / Sources", "user", "edge"),
        createComponent("Policy Enforcement Firewall", "security-control", "policy", "critical"),
        createComponent("Inspection Control", "security-control", "policy", "critical"),
        createComponent("Application Zone", "application", "internal"),
        createComponent("Sensitive Data Zone", "data", "internal"),
        createComponent("Monitoring Platform", "monitoring", "internal"),
      ],
      connections: [
        createConnection("users-sources", "policy-enforcement-firewall"),
        createConnection("policy-enforcement-firewall", "inspection-control"),
        createConnection("inspection-control", "application-zone", "Allowed Traffic"),
        createConnection("application-zone", "sensitive-data-zone"),
        createConnection("inspection-control", "monitoring-platform", "Security Logs", "dashed"),
      ],
    }, { prompt, classification });
  }

  return refreshArchitectureText({
    title: "Generic Secure Architecture Pattern",
    summary: "",
    assumptions: analysis.assumptions,
    appliedChanges: [],
    zones: [
      createZone("sources", "Sources / Users", "external"),
      createZone("control", "Security and Connectivity Layer", "security-zone"),
      createZone("services", "Protected Services", "internal"),
    ],
    components: [
      createComponent("Users / Source Systems", "user", "sources"),
      createComponent("Secure Gateway", "security-control", "control", "critical"),
      createComponent("Inspection Control", "security-control", "control", "critical"),
      createComponent("Application Services", "application", "services"),
      createComponent("Identity Service", "identity", "services"),
      createComponent("Monitoring Platform", "monitoring", "services"),
      createComponent("Data Services", "data", "services"),
    ],
    connections: [
      createConnection("users-source-systems", "secure-gateway"),
      createConnection("secure-gateway", "inspection-control"),
      createConnection("inspection-control", "application-services", "Allowed Traffic"),
      createConnection("identity-service", "application-services", "Policy"),
      createConnection("application-services", "data-services"),
      createConnection("inspection-control", "monitoring-platform", "Logs", "dashed"),
    ],
  }, { prompt, classification });
}

export async function generateArchitecture(
  prompt: string,
  analysis: PromptAnalysis,
): Promise<ArchitectureModel> {
  const classification = classifyPromptPattern(analysis.normalizedPrompt);

  if (shouldUseModelFallback(analysis, classification)) {
    const modelGenerated = await generateArchitectureWithModel(prompt, analysis, classification);
    if (modelGenerated) {
      return modelGenerated;
    }
  }

  return buildScenarioArchitecture(prompt, analysis, classification);
}

export function applyFollowupInstruction(
  architecture: ArchitectureModel,
  instruction: string,
): ArchitectureModel {
  const lower = instruction.toLowerCase();
  const next: ArchitectureModel = JSON.parse(JSON.stringify(architecture));
  let changed = false;
  const appliedChanges: string[] = [];

  const ensureComponent = (
    label: string,
    type: ArchitectureComponent["type"],
    zoneId: string,
    importance: ArchitectureComponent["importance"] = "normal",
  ) => {
    const existing = next.components.find((component) => component.label.toLowerCase() === label.toLowerCase());
    if (existing) {
      return existing.id;
    }
    const component = createComponent(label, type, zoneId, importance);
    next.components.push(component);
    changed = true;
    return component.id;
  };

  if (lower.includes("siem")) {
    const monitoringZone = next.zones.find((zone) => zone.id === "internal")?.id ?? next.zones[0]?.id;
    const siemId = ensureComponent("SIEM", "monitoring", monitoringZone);
    next.components
      .filter((component) => component.type === "security-control")
      .slice(0, 3)
      .forEach((component) => {
        const connectionId = `${component.id}-${siemId}`;
        if (!next.connections.some((connection) => connection.id === connectionId)) {
          next.connections.push(createConnection(component.id, siemId, "Logs", "dashed"));
          changed = true;
        }
      });
    appliedChanges.push("Added SIEM logging connections from key security controls.");
  }

  if (lower.includes("monitor")) {
    const monitoringZone = next.zones.find((zone) => zone.id === "internal")?.id ?? next.zones[0]?.id;
    const beforeCount = next.components.length;
    ensureComponent("Monitoring Console", "monitoring", monitoringZone);
    if (next.components.length > beforeCount) {
      appliedChanges.push("Added a monitoring console.");
    }
  }

  if (lower.includes("logging") || lower.includes("log")) {
    const internalZone = next.zones.find((zone) => zone.id === "internal")?.id ?? next.zones[0]?.id;
    const logId = ensureComponent("Central Log Store", "monitoring", internalZone);
    next.components
      .filter((component) => ["security-control", "application", "network"].includes(component.type))
      .slice(0, 4)
      .forEach((component) => {
        const connectionId = `${component.id}-${logId}`;
        if (!next.connections.some((connection) => connection.id === connectionId)) {
          next.connections.push(createConnection(component.id, logId, "Logs", "dashed"));
          changed = true;
        }
      });
    appliedChanges.push("Added centralized log collection.");
  }

  if (lower.includes("waf")) {
    const edgeZone =
      next.zones.find((zone) => zone.type === "dmz" || zone.type === "security-zone")?.id ?? next.zones[0]?.id;
    const wafId = ensureComponent("Web Application Firewall", "security-control", edgeZone, "critical");
    const upstream =
      next.components.find((component) => component.type === "user" || component.type === "network")?.id ??
      next.components[0]?.id;
    const appTarget =
      next.components.find((component) => component.type === "application")?.id ??
      next.components.find((component) => component.type === "data")?.id;

    if (upstream && !next.connections.some((connection) => connection.to === wafId)) {
      next.connections.push(createConnection(upstream, wafId, "Inspected Traffic"));
      changed = true;
    }

    if (appTarget && !next.connections.some((connection) => connection.from === wafId && connection.to === appTarget)) {
      next.connections.push(createConnection(wafId, appTarget, "Allowed Requests"));
      changed = true;
    }
    appliedChanges.push("Added a web application firewall path.");
  }

  if (lower.includes("identity") || lower.includes("mfa") || lower.includes("sso")) {
    const internalZone = next.zones.find((zone) => zone.id === "internal")?.id ?? next.zones[0]?.id;
    const identityId = ensureComponent("Identity Platform", "identity", internalZone, "critical");
    next.components
      .filter((component) => component.type === "application" || component.type === "security-control")
      .slice(0, 3)
      .forEach((component) => {
        const connectionId = `${identityId}-${component.id}`;
        if (!next.connections.some((connection) => connection.id === connectionId)) {
          next.connections.push(createConnection(identityId, component.id, "Auth / Policy"));
          changed = true;
        }
      });
    appliedChanges.push("Added identity and policy integration.");
  }

  if (lower.includes("branch") && !next.zones.some((zone) => zone.type === "branch")) {
    next.zones.push(createZone("branch", "Branch Office", "branch"));
    changed = true;
    const branchRouter = ensureComponent("Branch Router", "network", "branch");
    const edgeComponent =
      next.components.find((component) => component.type === "security-control") ??
      next.components.find((component) => component.type === "network");
    if (edgeComponent) {
      next.connections.push(createConnection(branchRouter, edgeComponent.id, "Secure Connectivity"));
      changed = true;
    }
    appliedChanges.push("Added a branch office connectivity path.");
  }

  const renameTargets = extractRenameTargets(instruction);
  if (renameTargets && renameTargets.from && renameTargets.to) {
    const renamed = renameComponent(next, renameTargets.from, renameTargets.to);
    if (renamed) {
      appliedChanges.push(`Renamed ${renameTargets.from} to ${renameTargets.to}.`);
      changed = true;
    }
  }

  if ((lower.includes("replace") || lower.includes("instead of")) && !changed) {
    changed = true;
  }

  if (
    (lower.includes("remove") || lower.includes("delete") || lower.includes("drop") || lower.includes("without")) &&
    !changed
  ) {
    const removableComponent = findComponentByInstruction(next.components, instruction);

    if (removableComponent) {
      next.components = next.components.filter((component) => component.id !== removableComponent.id);
      rewireAroundComponent(next, removableComponent.id);
      appliedChanges.push(`Removed ${removableComponent.label}.`);
      changed = true;
    }
  }

  if (!changed && instruction.trim()) {
    appliedChanges.push(`Captured follow-up request: ${instruction.trim()}.`);
  }

  next.appliedChanges = [...(next.appliedChanges ?? []), ...appliedChanges];

  return refreshArchitectureText(next);
}

import type {
  ArchitectureComponent,
  ArchitectureConnection,
  ArchitectureModel,
  ArchitectureZone,
} from "../../../shared/types/architecture.js";
import type { PromptAnalysis } from "../../../shared/types/analysis.js";
import { architectureSchema } from "../schemas/architectureSchema.js";
import { getAnthropicClient, getGenerateModel } from "./anthropic.js";
import { classifyPromptPattern, type ArchitecturePatternId } from "./patternLibrary.js";

const PATTERN_RATIONALE: Partial<Record<ArchitecturePatternId, string[]>> = {
  "partner-api-security": [
    "mTLS at the edge ensures only cert-holding partners can initiate API sessions.",
    "API gateway enforces rate limiting and quota before business logic is touched.",
    "OAuth2/OIDC token validation decouples partner identity from internal service auth.",
    "Audit logging at the backend provides non-repudiation for all partner transactions.",
  ],
  "hybrid-identity-cloud": [
    "Cloud identity platform is the single authentication authority for both cloud and on-prem apps.",
    "Directory sync keeps on-prem AD authoritative while extending SSO to SaaS applications.",
    "Conditional access evaluates risk signals (device, location, MFA) before granting any session.",
    "Dedicated connectivity (ExpressRoute/VPN) protects identity sync traffic from interception.",
  ],
  "identity-access": [
    "SSO portal eliminates credential sprawl by providing a single authentication entry point.",
    "Step-up MFA verification reduces risk from stolen or phished credentials.",
    "Token service centralizes session lifecycle, enabling fast revocation across all apps.",
  ],
  "zero-trust": [
    "No implicit trust based on network location — every access request is verified explicitly.",
    "Device posture check gates access for unmanaged devices before policy evaluation.",
    "Policy Decision Point combines identity context and posture signal before granting any session.",
    "CASB intercepts all cloud app traffic to enforce DLP and shadow-IT controls.",
  ],
  "sase-network": [
    "SASE consolidates network and security enforcement in the cloud, eliminating backhauling to HQ.",
    "Identity-aware access decisions are enforced at the cloud edge, close to where users connect.",
    "SD-WAN integration provides optimized, encrypted connectivity from branch sites.",
    "Consistent security policy applies whether users are at HQ, branch, or fully remote.",
  ],
  "waf-dmz": [
    "WAF in the DMZ inspects HTTP/S traffic before it reaches internal application servers.",
    "External firewall drops non-web traffic before it can reach the WAF inspection layer.",
    "Internal firewall provides a second enforcement boundary behind the WAF.",
    "DMZ isolation limits blast radius if the WAF or load balancer is compromised.",
  ],
  "email-security": [
    "Message filtering in the DMZ prevents malicious mail from entering the internal network.",
    "Firewall layers before and after the filter appliance enforce strict zone boundaries.",
    "Directory integration ensures delivery only to valid, authenticated internal recipients.",
  ],
  "ddos-protection": [
    "Cloud scrubbing absorbs volumetric attack traffic before it reaches the enterprise edge.",
    "BGP/anycast traffic redirection routes attack flows through the mitigation platform.",
    "Clean traffic is tunneled back to the edge router so legitimate users are unaffected during attacks.",
  ],
  "hybrid-connectivity": [
    "Encrypted tunnel (IPSec/IKEv2 or dedicated circuit) prevents interception of transit traffic.",
    "Connectivity gateway is the policy enforcement point for all cross-environment traffic.",
    "Cloud edge gateway provides the first inspection boundary inside the cloud perimeter.",
  ],
  "remote-access": [
    "Endpoint access client enforces device health checks before tunnel establishment.",
    "Encrypted tunnel (IPSec/TLS) protects all traffic across the untrusted public internet.",
    "Secure access gateway authenticates the user session before any internal network access is granted.",
  ],
  "logging-siem": [
    "Centralized log collection eliminates blind spots from siloed, per-device logging.",
    "Message queue buffers high-volume log streams so the SIEM ingests at its own rate without loss.",
    "Normalization layer ensures consistent event schema, making cross-source correlation reliable.",
    "SOAR automation closes the gap between SIEM alert and analyst action by triaging and enriching incidents.",
  ],
  "sandbox-analysis": [
    "Sandbox detonation safely executes suspicious files in a fully isolated environment.",
    "Verdict engine produces verdicts before results reach production workflows or endpoints.",
    "Multi-source submission (email, network, manual) ensures broad threat coverage.",
  ],
  "branch-networking": [
    "SD-WAN overlay provides encrypted branch connectivity without dedicated MPLS per site.",
    "Local security control at the branch reduces backhaul traffic for internet-destined flows.",
    "Central security gateway maintains consistent policy enforcement across all branch connections.",
  ],
  "ndr-visibility": [
    "Traffic mirroring (TAP/SPAN) provides passive east-west visibility with no inline risk.",
    "NDR analytics detect lateral movement patterns invisible to perimeter-only tools.",
    "Coverage across DMZ, core, and server farm closes blind spots between network segments.",
  ],
  "wireless-network": [
    "Separate SSIDs with VLAN isolation keep guest and corporate traffic on distinct paths.",
    "Private VLAN prevents guest devices from communicating with internal network resources.",
    "Internet-only VLAN restricts guest access at the policy layer, not just at the access point.",
  ],
  "segmentation": [
    "Firewall-enforced segmentation prevents lateral movement between application zones.",
    "Inspection at the policy layer ensures all inter-zone traffic is examined, not just north-south.",
    "Least-privilege zone design limits breach impact to a single segment.",
  ],
  "cloud-workload": [
    "Workload protection enforces runtime security policies at the compute layer.",
    "Identity and secrets management prevents credential theft from workload environments.",
    "Telemetry collection provides cloud-native activity visibility for SOC workflows.",
  ],
  "perimeter-firewall": [
    "Router at the perimeter provides the first ingress/egress control point for all external traffic.",
    "Stateful firewall inspects and filters traffic before it reaches any internal segment.",
    "Internal core switch enforces LAN-side segmentation between server and user zones.",
    "Out-of-band monitoring console keeps security telemetry off the production data path.",
  ],
};

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
  displayOrder?: number,
): ArchitectureComponent {
  return { id: slug(label), label, type, zoneId, importance, ...(displayOrder !== undefined && { displayOrder }) };
}

function createConnection(
  from: string,
  to: string,
  label?: string,
  style: ArchitectureConnection["style"] = "solid",
): ArchitectureConnection {
  const suffix = label ? `-${slug(label)}` : "";
  return { id: `${from}-${to}${suffix}`, from, to, label, style };
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


/**
 * Post-generation structural validator.
 *
 * Catches classes of violations that Claude produces despite system-prompt rules.
 * Applied to EVERY generated architecture (local patterns and Claude output alike).
 * Idempotent — running on a correct architecture makes no changes.
 *
 * Rules enforced:
 *   1. Identity components must not share a zone with network enforcement components.
 *   2. Monitoring components must not share a zone with network enforcement components.
 *   3. Upward connections (from a deeper zone to a shallower zone) are removed.
 *   4. Isolated security-control / identity components are auto-connected.
 *   5. Intra-zone connections flow left-to-right: `from` is forced left of `to`.
 *   6. Cross-zone inbound targets render in their zone's first row (displayOrder = 0).
 */
export function enforceArchitecturalConstraints(architecture: ArchitectureModel): ArchitectureModel {
  // ── Build zone → component list ──────────────────────────────────────────
  const byZone = new Map<string, ArchitectureComponent[]>();
  for (const comp of architecture.components) {
    const list = byZone.get(comp.zoneId) ?? [];
    list.push(comp);
    byZone.set(comp.zoneId, list);
  }

  const updatedZones: ArchitectureZone[] = [...architecture.zones];
  const updatedComponents: ArchitectureComponent[] = architecture.components.map((c) => ({ ...c }));

  const getOrCreateZone = (id: string, label: string, type: ArchitectureZone["type"]): string => {
    if (!updatedZones.find((z) => z.id === id)) {
      updatedZones.push({ id, label, type });
    }
    return id;
  };

  const moveComponent = (compId: string, newZoneId: string) => {
    const idx = updatedComponents.findIndex((c) => c.id === compId);
    if (idx !== -1) updatedComponents[idx] = { ...updatedComponents[idx]!, zoneId: newZoneId };
  };

  // ── Rule 1 & 2: Split misplaced identity / monitoring out of enforcement zones ──
  // Trigger on ANY security-control component in the zone — not just label-matched ones.
  // This catches "Workload Protection", "EDR Agent", etc. that don't match the firewall regex.
  for (const zone of architecture.zones) {
    const zoneComps = byZone.get(zone.id) ?? [];
    const hasAnySecurityControl = zoneComps.some((c) => c.type === "security-control");
    if (!hasAnySecurityControl) continue;

    const misplacedIdp = zoneComps.filter((c) => c.type === "identity");
    if (misplacedIdp.length > 0) {
      const zoneId = getOrCreateZone("identity-tier", "Identity", "security-zone");
      for (const comp of misplacedIdp) {
        console.log(`[normalizer] moving identity "${comp.label}" out of enforcement zone "${zone.label}"`);
        moveComponent(comp.id, zoneId);
      }
    }

    const misplacedMonitoring = zoneComps.filter((c) => c.type === "monitoring");
    if (misplacedMonitoring.length > 0) {
      const zoneId = getOrCreateZone("monitoring-tier", "Monitoring", "internal");
      for (const comp of misplacedMonitoring) {
        console.log(`[normalizer] moving monitoring "${comp.label}" out of enforcement zone "${zone.label}"`);
        moveComponent(comp.id, zoneId);
      }
    }
  }

  // ── Rule 3: Remove upward connections using zone array order ──
  // Claude outputs zones top-to-bottom (internet-facing first, deepest last).
  // A connection from zone[i] → zone[j] where i > j skips backward — remove it.
  // Newly created zones (identity-tier, monitoring-tier) are appended after original
  // zones so connections TO them are never flagged as upward.
  const zoneOrderIndex = new Map<string, number>();
  architecture.zones.forEach((z, i) => zoneOrderIndex.set(z.id, i));
  // Assign new zones indices beyond the original array length
  updatedZones.forEach((z, i) => {
    if (!zoneOrderIndex.has(z.id)) zoneOrderIndex.set(z.id, architecture.zones.length + i);
  });

  const compZone = new Map<string, string>();
  for (const comp of updatedComponents) compZone.set(comp.id, comp.zoneId);

  const filteredConnections = architecture.connections.filter((conn) => {
    const fromZoneId = compZone.get(conn.from);
    const toZoneId = compZone.get(conn.to);
    if (!fromZoneId || !toZoneId || fromZoneId === toZoneId) return true;

    const fromIdx = zoneOrderIndex.get(fromZoneId) ?? 0;
    const toIdx = zoneOrderIndex.get(toZoneId) ?? 0;

    if (fromIdx > toIdx) {
      console.log(`[normalizer] removing upward connection "${conn.from}" → "${conn.to}" (zone[${fromIdx}] → zone[${toIdx}])`);
      return false;
    }
    return true;
  });

  // ── Rule 4: Auto-connect isolated security-control / identity components ──
  // Any such component with zero connections gets wired to the nearest application
  // or network component in a shallower zone (earlier in the zones array).
  const connectedIds = new Set<string>();
  for (const conn of filteredConnections) {
    connectedIds.add(conn.from);
    connectedIds.add(conn.to);
  }

  const autoConnections: ArchitectureConnection[] = [];
  for (const comp of updatedComponents) {
    if (connectedIds.has(comp.id)) continue;
    if (comp.type !== "security-control" && comp.type !== "identity") continue;

    const compZoneIdx = zoneOrderIndex.get(comp.zoneId) ?? 0;
    // Find the nearest candidate: application/network/data component in the closest shallower zone.
    // Sort by zone index descending so the immediately-adjacent zone wins over a distant one.
    const candidate = updatedComponents
      .filter((c) => {
        if (c.id === comp.id) return false;
        const cIdx = zoneOrderIndex.get(c.zoneId) ?? 0;
        return (c.type === "application" || c.type === "network" || c.type === "data") && cIdx < compZoneIdx;
      })
      .sort((a, b) => (zoneOrderIndex.get(b.zoneId) ?? 0) - (zoneOrderIndex.get(a.zoneId) ?? 0))[0];

    if (candidate) {
      const connId = `${candidate.id}-to-${comp.id}-auto`;
      const connStyle: "solid" | "dashed" = comp.type === "identity" ? "dashed" : "solid";
      autoConnections.push({ id: connId, from: candidate.id, to: comp.id, style: connStyle });
      connectedIds.add(comp.id);
      connectedIds.add(candidate.id);
      console.log(`[normalizer] auto-connecting isolated "${comp.label}" ← "${candidate.label}"`);
    }
  }

  const allConns = [...filteredConnections, ...autoConnections];

  // ── Rule 5: Fix intra-zone right-to-left connections ─────────────────────
  // Same-zone connections must flow left-to-right (`from` renders LEFT of `to`).
  // If the effective display-order rank puts `from` after `to`, explicitly
  // reassign displayOrder so the layout places `from` first.
  const COMP_TYPE_RANK: Record<string, number> = {
    user: 0, network: 1, "security-control": 2, identity: 3,
    application: 4, data: 5, monitoring: 6, integration: 7,
  };
  for (const conn of allConns) {
    const fzId = compZone.get(conn.from);
    const tzId = compZone.get(conn.to);
    if (!fzId || !tzId || fzId !== tzId) continue; // same-zone only

    const fi = updatedComponents.findIndex((c) => c.id === conn.from);
    const ti = updatedComponents.findIndex((c) => c.id === conn.to);
    if (fi === -1 || ti === -1) continue;

    const fc = updatedComponents[fi]!;
    const tc = updatedComponents[ti]!;
    const fRank = fc.displayOrder ?? COMP_TYPE_RANK[fc.type] ?? 4;
    const tRank = tc.displayOrder ?? COMP_TYPE_RANK[tc.type] ?? 4;

    if (fRank >= tRank) {
      // `from` renders at same position or RIGHT of `to` — fix it
      const lo = Math.min(fRank, tRank);
      updatedComponents[fi] = { ...fc, displayOrder: lo > 0 ? lo - 1 : 0 };
      updatedComponents[ti] = { ...tc, displayOrder: lo > 0 ? lo : lo + 1 };
      console.log(`[normalizer] Rule 5: intra-zone l→r "${fc.label}" before "${tc.label}"`);
    }
  }

  // ── Rule 6: Cross-zone inbound targets render in their zone's first row ───
  // A component receiving a downward cross-zone connection is the entry point
  // of its zone. Setting displayOrder = 0 guarantees it lands in row 1 so
  // inbound arrows arrive without threading through rows above it.
  // Only applied when no explicit displayOrder was set by the static pattern.
  for (const conn of allConns) {
    const fzId = compZone.get(conn.from);
    const tzId = compZone.get(conn.to);
    if (!fzId || !tzId || fzId === tzId) continue; // cross-zone only

    const fOrdIdx = zoneOrderIndex.get(fzId) ?? 0;
    const tOrdIdx = zoneOrderIndex.get(tzId) ?? 0;
    if (fOrdIdx >= tOrdIdx) continue; // downward only

    const ti = updatedComponents.findIndex((c) => c.id === conn.to);
    if (ti === -1) continue;
    const tc = updatedComponents[ti]!;
    if (tc.displayOrder === undefined) {
      updatedComponents[ti] = { ...tc, displayOrder: 0 };
      console.log(`[normalizer] Rule 6: zone entry point "${tc.label}" → displayOrder 0`);
    }
  }

  return {
    ...architecture,
    zones: updatedZones,
    components: updatedComponents,
    connections: allConns,
  };
}

async function generateArchitectureWithModel(
  prompt: string,
  analysis: PromptAnalysis,
  classification: ReturnType<typeof classifyPromptPattern>,
) {
  const client = getAnthropicClient();

  if (!client) {
    console.error("[model] Anthropic client not initialised — ANTHROPIC_API_KEY missing or empty");
    return null;
  }

  console.log(`[model] calling Claude for pattern="${classification.pattern}" prompt="${prompt.slice(0, 80)}"`);

  try {
    const response = await client.messages.create({
      model: getGenerateModel(),
      max_tokens: 4096,
      temperature: 0.2,
      system: [
        "You generate network and security architecture models that will be rendered as Excalidraw zone diagrams.",
        "Return ONLY valid JSON — no markdown, no code fences, no commentary.",
        "",
        "LAYOUT RULES (critical — the renderer is zone-based, not free-form):",
        "- Use 3 to 5 zones. Each zone renders as a labeled horizontal band.",
        "- Put 1 to 3 components per zone. The renderer places them side-by-side in a row; more than 3 crowds the diagram.",
        "- Order zones top-to-bottom from least trusted (external/internet) to most trusted (internal/data-center).",
        "- Security controls (firewalls, gateways, proxies, policy engines) belong in their own zone between external and internal zones — never mixed into user or application zones.",
        "- Use a dedicated 'cloud' zone for cloud-hosted services; a 'branch' zone for remote sites; a 'data-center' zone for on-prem DC resources.",
        "- Keep total components between 5 and 12. Keep connections at most 14.",
        "- HYBRID ON-PREM-TO-CLOUD zone order (VPN / ExpressRoute / Direct Connect patterns): On-Prem Data Center → Transit/Gateway layer (VPN Gateway, AWS Transit Gateway, ExpressRoute GW — this is where the tunnel terminates) → Security Enforcement (NGFW, Network Firewall, WAF) → Application/Data zone → Monitoring/Identity. The transit layer RECEIVES on-prem traffic before security inspection — placing Security Enforcement above the Transit layer creates impossible upward connections and is architecturally wrong.",
        "",
        "NAMING RULES:",
        "- Use vendor-specific names when inferable: Cisco ASA / Palo Alto NGFW for firewalls; Zscaler / Netskope for SASE/ZTNA; Splunk / Microsoft Sentinel for SIEM; CrowdStrike for EDR; F5 / Imperva for WAF; Okta / Entra ID for identity.",
        "- Preserve every explicit product name from the prompt (AWS, Azure, Fortinet, Check Point, Exchange, etc.).",
        "- Component labels must be concise — 2 to 4 words maximum. Avoid parenthetical qualifiers.",
        "- Active-active topology: when the prompt explicitly requests active-active, label every region zone as '(Active)' — never '(Primary)' or '(Secondary)'. Primary/Secondary implies active-passive standby, which contradicts active-active.",
        "- Parallel zone rendering: for active-active or multi-region topologies, assign the same integer `row` value (e.g. row: 1) to every sibling region zone so the renderer places them side-by-side instead of stacking them vertically. Zones without a `row` field render as full-width bands as normal.",
        "",
        "CONNECTION RULES:",
        "- Label connections with the specific protocol or control name where meaningful: IPSec/IKEv2, HTTPS, SAML 2.0, syslog/514, SD-WAN, ZTNA, BGP, SMTP, MAPI.",
        "- Use dashed style for out-of-band or monitoring flows (syslog, SNMP, telemetry); solid for primary data paths.",
        "- Only connect components that have a direct and meaningful relationship — skip transitive hops.",
        "- Every component must have at least one connection (incoming or outgoing). An isolated component with zero connections is always an error — add the most architecturally appropriate edge. On-prem workloads/servers connect to the on-prem core router or network device. Identity providers connect to the application components they authenticate.",
        "- Use at most ONE labeled connection between any pair of adjacent zones. Multiple labeled arrows in the same inter-zone corridor overlap and become unreadable. Combine related flows into a single connection with a composite label (e.g. 'Replication / Telemetry') or drop the label on the secondary connection.",
        "- Active-active fan-out: when a load balancer or global router distributes to multiple active regions, add an explicit connection from that component to EACH region zone. Omitting a region's inbound connection makes it appear passive/standby even if labeled Active.",
        "- Identity provider connections (SAML 2.0, OIDC, OAuth2) must go directly from the identity component to the consuming application component — never routed through or attributed to a WAF or firewall.",
        "- Never generate upward connections (from a lower zone back to a higher zone). All data-plane connections flow top-to-bottom. Config distribution from a shared services zone must be modelled as a dashed out-of-band pull, not a push arrow going upward.",
        "- Never create a direct connection between components whose zones are not adjacent in the zones array. If zone A is directly above zone B and zone B is directly above zone C, do not connect a component in A to a component in C — route through an appropriate component in zone B, or omit the skip-zone connection entirely. Skip-zone arrows pass through intermediate zones and visually overlap components in those zones.",
        "",
        "SECURITY PERSPECTIVE:",
        "- Design as a security architect, not a network engineer. Emphasise where inspection, authentication, and policy enforcement occur.",
        "- Every architecture must have at least one security-control component (firewall, gateway, proxy, policy engine, or identity provider) marked importance: critical.",
        "- Include a securityRationale array of exactly 3 concise bullet strings explaining the key security design decisions.",
        "- Only include components that participate in the data-plane, security-plane, or observability-plane. Infrastructure-as-code tools (Terraform, Ansible, Chef, Puppet) are out of scope — omit them.",
        "- Any component with type 'monitoring' (SIEM, log aggregator, telemetry collector, Splunk, Sentinel, QRadar, CloudWatch, Datadog, Elastic, etc.) must always be placed in its own dedicated monitoring zone — never in the same zone as enforcement components (NGFW, WAF, IPS, workload protection, firewall). This applies regardless of the component's label.",
        "- Identity providers (Okta, Entra ID, Ping Identity, Auth0, Duo, etc.) must never be placed in a network enforcement zone alongside firewalls, IPS, or WAF components. Place them in a dedicated identity zone (type: security-zone) or the application/internal zone.",
        "- Connections TO a monitoring platform must always use dashed style — they are out-of-band log/telemetry flows, not primary data paths. Never model them as solid enforcement connections.",
        "- Label enforcement-to-enforcement connections with the specific protocol or handoff name (e.g. 'Filtered Traffic', 'HTTPS', 'BGP'). Never use vague terms like 'Allowed Traffic', 'Filtered Telemetry', or 'Traffic'. If no meaningful label applies, omit the label entirely.",
        "- Security control components (workload protection, EDR, WAF, secrets manager, identity broker, policy engine) MUST have at least one connection to the workload or application component they protect or serve. A security control with zero connections is never correct — it has no effect on anything.",
        "",
        "PRE-OUTPUT VERIFICATION CHECKLIST — check every item before returning JSON:",
        "1. Fan-out: count zones labeled (Active). Count connections FROM the load balancer / global router. These two numbers must be equal — one connection per active region, no exceptions.",
        "2. Corridor labels: for every adjacent zone pair, count connections that have a non-empty label. If count > 1, remove labels from all but the highest-priority connection in that corridor.",
        "3. Intra-zone arrow direction: connections between components within the same zone must flow left-to-right. If component A sends traffic to B, A must be the 'from' end. Never generate a right-to-left intra-zone arrow.",
        "4. Identity routing: search for any connection whose label contains 'SAML', 'OIDC', or 'OAuth'. Verify its 'from' is an identity component and its 'to' is an application component — not a firewall, WAF, or gateway. Also verify no identity provider (Okta, Entra ID, Ping, Auth0) shares a zone with any firewall, IPS, WAF, or proxy component — if so, move the identity provider to a separate zone.",
        "5. No upward arrows: every connection must go from a zone higher in the list to a zone lower in the list (or within the same zone). Connections that go from a lower zone back to a higher zone are forbidden.",
        "6. Isolated components (BLOCKING): list every component id. For each, search the connections array for any entry where 'from' or 'to' equals that id. If ANY component has zero matches — DO NOT return the JSON yet. Add the missing connection first: security controls connect to the workload/app they protect; on-prem workloads connect to the on-prem network; identity brokers connect to the app tier. Only return JSON when every component id appears at least once in connections.",
        "7. Monitoring zone (BLOCKING): list every component with type 'monitoring'. If ANY monitoring component shares a zone with a security-control component — DO NOT return the JSON yet. Move the monitoring component to a dedicated monitoring zone (create one if needed, type: security-zone, label: 'Monitoring'). Only return JSON after this is fixed.",
        "8. Hybrid transit order: if the architecture has both a transit/gateway zone and a security-enforcement zone, confirm the transit zone appears EARLIER in the zones array than security enforcement. Swap them if needed.",
        "9. Skip-zone connections: for every connection, identify the zone index of 'from' and the zone index of 'to'. If the absolute difference in zone index is greater than 1, the connection skips an intermediate zone — remove it and replace with connections that route through the intermediate zone, or omit it if it is a transitive hop already covered by adjacent-zone connections.",
        "",
        "ALLOWED VALUES:",
        "- zone types: external, dmz, security-zone, internal, cloud, branch, data-center",
        "- component types: user, network, security-control, identity, application, data, monitoring, integration",
        "- importance: normal, critical",
        "- connection style: solid, dashed",
        "- ids: lowercase slugs (kebab-case, no spaces)",
      ].join("\n"),
      messages: [
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
              securityRationale: ["string — key security design decision, 3–4 items"],
              zones: [{ id: "string", label: "string", type: "external|dmz|security-zone|internal|cloud|branch|data-center", row: "number (optional — same value = side-by-side)" }],
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

    const block = response.content[0];
    const content = block?.type === "text" ? block.text : null;
    if (!content) {
      return null;
    }

    const cleaned = content.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();

    let rawJson: unknown;
    try {
      rawJson = JSON.parse(cleaned);
    } catch (err) {
      console.error("[model] JSON parse failed:", err instanceof Error ? err.message : err);
      console.error("[model] raw content:", cleaned.slice(0, 500));
      return null;
    }

    const result = architectureSchema.safeParse(rawJson);
    if (!result.success) {
      console.error("[model] schema validation failed:", JSON.stringify(result.error.flatten(), null, 2));
      return null;
    }

    const normalized = normalizeGeneratedArchitecture({
      ...result.data,
      assumptions: analysis.assumptions,
      appliedChanges: [],
    });

    if (!normalized) {
      console.error("[model] normalizeGeneratedArchitecture returned null — all connections may have failed to resolve");
      return null;
    }

    return refreshArchitectureText(normalized, { prompt, classification });
  } catch (err) {
    console.error("[model] unexpected error:", err instanceof Error ? err.message : err);
    return null;
  }
}

// Patterns that already handle vendor branching in their static template
const VENDOR_AWARE_STATIC_PATTERNS: ArchitecturePatternId[] = [
  "hybrid-connectivity",
  "email-security",
  "wireless-network",
  "sase-network",
  "hybrid-identity-cloud",
  "waf-dmz",
  "ndr-visibility",
  "zero-trust",
];

function hasHighSpecificity(prompt: string): boolean {
  // Named vendor or product that the static template won't reflect
  return /\b(palo alto|cisco|fortinet|check point|checkpoint|crowdstrike|splunk|microsoft sentinel|qradar|cortex|darktrace|zscaler|netskope|okta|ping identity|cyberark|hashicorp vault|illumio|guardicore)\b/i.test(prompt);
}

function shouldUseModelFallback(
  analysis: PromptAnalysis,
  classification: ReturnType<typeof classifyPromptPattern>,
  prompt: string,
) {
  if (classification.pattern === "generic-secure-architecture") return true;
  if (classification.confidence < 0.8) return true;
  // Only check analysis confidence for borderline pattern matches — a strong pattern match
  // (0.88) is authoritative; don't let uncertain prompt analysis override it.
  if (classification.confidence < 0.88 && analysis.confidence < 0.75) return true;
  // Route to Claude when prompt has vendor-specific detail that static templates can't reflect
  if (hasHighSpecificity(prompt) && !VENDOR_AWARE_STATIC_PATTERNS.includes(classification.pattern)) return true;
  // Cloud infrastructure prompts with VPC/subnet/resource-level detail
  if (/\b(vpc|subnet|security group|ec2|eks|aks|gke|lambda|s3 bucket|rds|load balancer|igw|nat gateway|transit gateway|vnet|resource group)\b/i.test(prompt)) return true;
  // Multi-site or campus-scale prompts that static templates can't represent
  if (/\b(hq|headquarters)\b.*\b(branch|data.?center|dc|office)\b|\b(branch|data.?center|dc|office)\b.*\b(hq|headquarters)\b/i.test(prompt) &&
      /(two|three|four|five|multiple|several|\d+)\s+(branch|site|office|data.?center)/i.test(prompt)) return true;
  // Explicit multi-location lists (three or more named sites)
  if ((prompt.match(/\b(site|office|location|data.?center|branch)\b/gi) ?? []).length >= 3) return true;
  // Prompts that name 4+ distinct networking or security technologies (complex integration)
  const techCount = (prompt.match(/\b(firewall|ids|ips|siem|edr|xdr|dlp|casb|waf|iam|pam|nac|soa[rp]|ndr|ueba|deception|honeypot)\b/gi) ?? []).length;
  if (techCount >= 4) return true;
  return false;
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
    return "Corporate and guest users connect through a dual-band access point over separate SSIDs, keeping employee and guest devices on isolated wireless segments.";
  }

  if (architecture.title.includes("Zero Trust")) {
    return "User and device access is brokered through identity, policy, and access proxy controls before any internal or SaaS application session is established.";
  }

  if (architecture.title.includes("SASE")) {
    return "Users and branch sites connect through a cloud-delivered SASE platform that combines ZTNA, cloud firewall, SWG, and CASB into a single policy enforcement point before reaching any corporate resource.";
  }

  if (architecture.title.includes("Segmentation")) {
    return "Traffic is inspected and segmented before it reaches protected application, data, and monitoring zones, keeping the main enforcement path simple and visible.";
  }

  if (architecture.title.includes("Perimeter Firewall")) {
    return "Internet traffic enters through a perimeter router and is inspected by a stateful firewall before reaching the internal core switch, which distributes connectivity to server and user segments.";
  }

  if (architecture.title.includes("Centralized Logging and SIEM")) {
    return "Log sources feed into a central collection and enrichment pipeline that normalizes events before ingestion by the SIEM, with SOAR automation closing the gap between alert and analyst action.";
  }

  if (architecture.title.includes("Threat Analysis Sandbox")) {
    return "Suspicious files from email, network, and manual sources are submitted through a gateway and detonated in an isolated sandbox, with verdict results driving alerting and automated response workflows.";
  }

  if (architecture.title.includes("Secure Remote Access")) {
    return "A remote user reaches internal business services through a VPN-based access path with encrypted transport, gateway enforcement, and identity validation.";
  }

  if (architecture.title.includes("NDR Visibility")) {
    return "Passive sensors tap traffic across the DMZ, core network, and server farm, feeding an NDR analytics platform that correlates east-west patterns and surfaces findings to the SOC console.";
  }

  if (architecture.title.includes("Branch Networking")) {
    return "Branch users connect through local security controls and an SD-WAN overlay to a central security gateway at HQ, with policy enforcement and telemetry maintained centrally across all sites.";
  }

  if (architecture.title.includes("Cloud Workload Protection")) {
    return "Workload protection and identity controls enforce runtime security at the cloud compute layer, with telemetry flowing to a security operations team for SOC visibility.";
  }

  if (architecture.title.includes("Enterprise Core Network with DMZ")) {
    return "External traffic passes through a DMZ with perimeter firewall and IDS/IPS inspection before reaching an internal firewall and application tier, keeping untrusted flows isolated from core servers.";
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

  if (classification?.pattern === "sase-network") {
    return "SASE Network Architecture";
  }

  if (classification?.pattern === "segmentation") {
    return "Segmentation and Inspection Architecture";
  }

  if (classification?.pattern === "perimeter-firewall") {
    return "Enterprise Network with Perimeter Firewall and Router";
  }

  if (classification?.pattern === "logging-siem") {
    return "Centralized Logging and SIEM Architecture";
  }

  if (classification?.pattern === "sandbox-analysis") {
    return "Threat Analysis Sandbox Architecture";
  }

  if (classification?.pattern === "remote-access") {
    return "Secure Remote Access Architecture";
  }

  if (classification?.pattern === "ndr-visibility") {
    return "NDR Visibility Across Network Zones";
  }

  if (classification?.pattern === "branch-networking") {
    return "Branch Networking Architecture";
  }

  if (classification?.pattern === "cloud-workload") {
    return "Cloud Workload Protection Architecture";
  }

  if (classification?.pattern === "core-dmz") {
    return "Enterprise Core Network with DMZ";
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
    const corpSsidId = slug(`${corporateLabel} SSID`);
    const guestSsidId = slug(`${guestLabel} SSID`);

    return refreshArchitectureText({
      title: "Wireless Network Segmentation Pattern",
      summary: "",
      assumptions: analysis.assumptions,
      appliedChanges: [],
      zones: [
        createZone("upstream", "Upstream Network", "external"),
        // AP alone in its zone so arrows to both SSIDs are clean inter-zone downward connections
        createZone("wireless", "Wireless Infrastructure", "security-zone"),
        // SSIDs in their own zone — side by side, directly below the AP
        createZone("ssid", "Network Segments", "security-zone"),
        // Devices at the bottom
        createZone("devices", "Connected Devices", "internal"),
      ],
      components: [
        createComponent("Internet", "network", "upstream"),
        createComponent("Main Router", "network", "upstream"),
        createComponent("Dual-Band Access Point", "network", "wireless", "critical"),
        createComponent(`${corporateLabel} SSID`, "network", "ssid"),
        createComponent(`${guestLabel} SSID`, "network", "ssid"),
        createComponent("Employee Devices", "user", "devices"),
        createComponent("Guest Devices", "user", "devices"),
      ],
      connections: [
        createConnection("internet", "main-router"),
        createConnection("main-router", "dual-band-access-point"),
        // No labels on AP→SSID — box labels already name the segment; avoids duplication
        createConnection("dual-band-access-point", corpSsidId),
        createConnection("dual-band-access-point", guestSsidId),
        // Cross-zone downward arrows — always flow top-to-bottom, no upward confusion
        createConnection(corpSsidId, "employee-devices"),
        createConnection(guestSsidId, "guest-devices"),
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
        createConnection("email-security-source", "submission-gateway", "SMTP / IMAP"),
        createConnection("network-security-source", "submission-gateway", "syslog / API"),
        createConnection("security-operations-source", "submission-gateway", "Manual Submit"),
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
        createZone("gateway", "Access Control Layer", "security-zone"),
        createZone("internal", "Internal Network", "internal"),
      ],
      components: [
        createComponent("Remote User", "user", "home", "normal", 0),
        createComponent("VPN Client", "security-control", "home", "normal", 1),
        createComponent("Home Router", "network", "home", "normal", 2),
        createComponent("ISP Infrastructure", "network", "internet"),
        // Rendered with a dashed border — logical construct, not a physical device
        createComponent("Encrypted VPN Tunnel", "security-control", "internet", "critical"),
        createComponent("VPN Gateway", "security-control", "gateway", "critical"),
        createComponent("Core Switch", "network", "internal"),
        createComponent("Application Server", "application", "internal"),
        createComponent("Internal Database", "data", "internal"),
      ],
      connections: [
        createConnection("remote-user", "vpn-client"),
        createConnection("vpn-client", "home-router"),
        createConnection("home-router", "isp-infrastructure", "VPN Connection"),
        createConnection("isp-infrastructure", "encrypted-vpn-tunnel"),
        createConnection("encrypted-vpn-tunnel", "vpn-gateway", "IPSec/IKEv2"),
        createConnection("vpn-gateway", "core-switch"),
        createConnection("core-switch", "application-server"),
        createConnection("application-server", "internal-database"),
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
        createComponent("End User Devices", "user", "clients"),
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
        createConnection(explicitExchange ? "exchange-email-server" : "internal-messaging-service", "end-user-devices", "MAPI / HTTPS"),
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
        createConnection("edge-router", "edge-protection-appliance", undefined, "dashed"),
        createConnection("edge-router", "telemetry-collector", "Flow Stats / SNMP", "dashed"),
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
        createZone("monitoring", "Shared Monitoring", "security-zone"),
      ],
      components: [
        createComponent("On-Prem Core Network", "network", "onprem", "normal", 0),
        createComponent("On-Prem Application Segment", "application", "onprem", "normal", 1),
        createComponent("Connectivity Gateway", "security-control", "connectivity", "critical"),
        createComponent("Cloud Edge Gateway", "security-control", "cloud", "critical"),
        createComponent(networkLabel, "network", "cloud"),
        createComponent(appLabel, "application", "cloud"),
        createComponent("Monitoring Platform", "monitoring", "monitoring"),
      ],
      connections: [
        createConnection("on-prem-core-network", "on-prem-application-segment"),
        createConnection("on-prem-core-network", "connectivity-gateway"),
        createConnection("connectivity-gateway", "cloud-edge-gateway", "IPSec/IKEv2 Tunnel"),
        createConnection("cloud-edge-gateway", slug(networkLabel)),
        createConnection(slug(networkLabel), slug(appLabel)),
        createConnection("cloud-edge-gateway", "monitoring-platform", "Telemetry", "dashed"),
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
        createConnection("internal-firewall", "security-management-console", "Logs / Alerts", "dashed"),
      ],
    }, { prompt, classification });
  }

  if (classification.pattern === "ndr-visibility") {
    return refreshArchitectureText({
      title: "NDR Visibility Across Network Zones",
      summary: "",
      assumptions: analysis.assumptions,
      appliedChanges: [],
      zones: [
        createZone("dmz", "DMZ", "dmz"),
        createZone("core", "Core Network", "security-zone"),
        createZone("server", "Server Farm", "internal"),
        createZone("ndr", "NDR Management", "security-zone"),
      ],
      components: [
        // DMZ — real infrastructure + sensor rightmost
        createComponent("Perimeter Firewall", "security-control", "dmz", "critical", 0),
        createComponent("NDR Sensor - DMZ", "security-control", "dmz", "normal", 1),
        // Core Network — switch + sensor rightmost
        createComponent("Core Switch", "network", "core", "normal", 0),
        createComponent("Internal Firewall", "security-control", "core", "critical", 1),
        createComponent("NDR Sensor - Core", "security-control", "core", "normal", 2),
        // Server Farm — servers + sensor rightmost
        createComponent("Application Server", "application", "server", "normal", 0),
        createComponent("Database Server", "data", "server", "normal", 1),
        createComponent("NDR Sensor - Server Farm", "security-control", "server", "normal", 2),
        // NDR Management
        createComponent("NDR Analytics Platform", "security-control", "ndr", "critical", 0),
        createComponent("SOC Console", "monitoring", "ndr", "normal", 1),
      ],
      connections: [
        // Primary traffic flow (solid)
        createConnection("perimeter-firewall", "core-switch"),
        createConnection("core-switch", "internal-firewall"),
        createConnection("internal-firewall", "application-server"),
        createConnection("application-server", "database-server"),
        // SPAN/mirror feeds to sensors (intra-zone, dashed)
        createConnection("perimeter-firewall", "ndr-sensor-dmz", "SPAN / Mirror", "dashed"),
        createConnection("core-switch", "ndr-sensor-core", "SPAN / Mirror", "dashed"),
        createConnection("application-server", "ndr-sensor-server-farm", "SPAN / Mirror", "dashed"),
        // Sensors feed NDR platform (dashed telemetry)
        createConnection("ndr-sensor-dmz", "ndr-analytics-platform", "Telemetry", "dashed"),
        createConnection("ndr-sensor-core", "ndr-analytics-platform", "Telemetry", "dashed"),
        createConnection("ndr-sensor-server-farm", "ndr-analytics-platform", "Telemetry", "dashed"),
        // NDR platform → SOC
        createConnection("ndr-analytics-platform", "soc-console", "Findings"),
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
        createZone("sources", "Log Sources", "external"),
        createZone("collection", "Collection and Enrichment", "security-zone"),
        createZone("operations", "Monitoring Operations", "internal"),
      ],
      components: [
        createComponent("Network Devices", "network", "sources"),
        createComponent("Security Controls", "security-control", "sources"),
        createComponent("Endpoints / EDR", "security-control", "sources"),
        createComponent("Cloud Platforms", "application", "sources"),
        createComponent("Log Collector / Forwarder", "monitoring", "collection", "critical"),
        createComponent("Message Queue / Buffer", "integration", "collection"),
        createComponent("Normalization and Parsing", "monitoring", "collection"),
        createComponent("Threat Intelligence Feed", "integration", "collection"),
        createComponent("SIEM Platform", "monitoring", "operations", "critical"),
        createComponent("SOAR / Automation", "integration", "operations"),
        createComponent("SOC Analyst Workflow", "monitoring", "operations"),
      ],
      connections: [
        createConnection("network-devices", "log-collector-forwarder", "syslog / SNMP", "dashed"),
        createConnection("security-controls", "log-collector-forwarder", "CEF / Syslog", "dashed"),
        createConnection("endpoints-edr", "log-collector-forwarder", "Agent / API", "dashed"),
        createConnection("cloud-platforms", "log-collector-forwarder", "API / Webhook", "dashed"),
        createConnection("log-collector-forwarder", "message-queue-buffer"),
        createConnection("message-queue-buffer", "normalization-and-parsing"),
        createConnection("normalization-and-parsing", "siem-platform", "Normalized Events"),
        createConnection("threat-intelligence-feed", "siem-platform", "IOC Enrichment", "dashed"),
        createConnection("siem-platform", "soar-automation", "Triggered Alert"),
        createConnection("soar-automation", "soc-analyst-workflow", "Case / Incident"),
      ],
    }, { prompt, classification });
  }

  if (classification.pattern === "zero-trust") {
    return refreshArchitectureText({
      title: "Zero Trust Access Architecture",
      summary: "",
      assumptions: analysis.assumptions,
      appliedChanges: [],
      zones: [
        createZone("users", "Users / Devices", "external"),
        createZone("identity", "Identity", "security-zone"),
        createZone("policy", "Policy Enforcement", "security-zone"),
        createZone("apps", "Protected Resources", "internal"),
        createZone("monitoring", "Monitoring", "security-zone"),
      ],
      components: [
        createComponent("Users", "user", "users", "normal", 0),
        createComponent("Managed Devices", "network", "users", "normal", 1),
        createComponent("Unmanaged Devices", "network", "users", "normal", 2),
        createComponent("Identity Platform", "identity", "identity", "critical"),
        createComponent("Device Posture Check", "security-control", "policy", "normal", 0),
        createComponent("Policy Decision Point", "security-control", "policy", "critical", 1),
        createComponent("Access Proxy", "security-control", "policy", "critical", 2),
        createComponent("Internal Apps", "application", "apps", "normal", 0),
        createComponent("SaaS Apps", "application", "apps", "normal", 1),
        createComponent("Audit Logging", "monitoring", "monitoring"),
      ],
      connections: [
        createConnection("users", "managed-devices"),
        createConnection("managed-devices", "identity-platform", "Authenticate"),
        createConnection("unmanaged-devices", "identity-platform", "Authenticate"),
        createConnection("identity-platform", "policy-decision-point", "Identity Context"),
        createConnection("device-posture-check", "policy-decision-point", "Posture Signal"),
        createConnection("policy-decision-point", "access-proxy", "Access Decision"),
        createConnection("access-proxy", "internal-apps", "HTTPS"),
        createConnection("access-proxy", "saas-apps", "HTTPS"),
        createConnection("access-proxy", "audit-logging", "Session Logs", "dashed"),
      ],
    }, { prompt, classification });
  }

  if (classification.pattern === "sase-network") {
    return refreshArchitectureText({
      title: "SASE Network Pattern",
      summary: "",
      assumptions: analysis.assumptions,
      appliedChanges: [],
      zones: [
        createZone("users", "Users and Devices", "external"),
        createZone("identity", "Identity Provider", "security-zone"),
        createZone("sase", "SASE Cloud Platform", "cloud"),
        createZone("resources", "Corporate Resources", "internal"),
      ],
      components: [
        createComponent("Remote Users", "user", "users"),
        createComponent("Branch Offices", "network", "users"),
        createComponent("Identity Provider", "identity", "identity", "critical"),
        createComponent("ZTNA Access Proxy", "security-control", "sase", "critical"),
        createComponent("Cloud Firewall / SWG", "security-control", "sase", "critical"),
        createComponent("CASB", "security-control", "sase"),
        createComponent("SD-WAN Gateway", "network", "sase", "critical"),
        createComponent("Internal Applications", "application", "resources"),
        createComponent("SaaS Applications", "application", "resources"),
        createComponent("Data Center", "data", "resources"),
      ],
      connections: [
        createConnection("remote-users", "identity-provider", "Authenticate"),
        createConnection("branch-offices", "sd-wan-gateway", "SD-WAN / IPSec"),
        createConnection("identity-provider", "ztna-access-proxy", "Auth Token", "dashed"),
        createConnection("ztna-access-proxy", "cloud-firewall-swg", "Policy Enforcement"),
        createConnection("sd-wan-gateway", "cloud-firewall-swg", "Traffic Inspection"),
        createConnection("cloud-firewall-swg", "casb", "Cloud App Inspect"),
        createConnection("cloud-firewall-swg", "internal-applications", "HTTPS"),
        createConnection("casb", "saas-applications", "CASB Proxy"),
        createConnection("cloud-firewall-swg", "data-center", "Protected Access"),
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
        createComponent("Identity / Secrets", "identity", "ops"),
        createComponent("Security Operations", "monitoring", "ops"),
      ],
      connections: [
        createConnection("workload-protection", "cloud-workloads", "Protection"),
        createConnection("identity-secrets", "cloud-workloads", "Identity Check", "dashed"),
        createConnection("cloud-workloads", "data-services"),
        createConnection("cloud-workloads", "security-operations", "Telemetry", "dashed"),
      ],
    }, { prompt, classification });
  }

  if (classification.pattern === "perimeter-firewall") {
    const hasDmz = promptMentions(prompt, ["dmz"]);

    return refreshArchitectureText({
      title: "Perimeter Firewall Pattern",
      summary: "",
      assumptions: analysis.assumptions,
      appliedChanges: [],
      zones: [
        createZone("internet", "Public Internet", "external"),
        createZone("perimeter", "Network Perimeter", "security-zone"),
        createZone("internal", "Internal Network", "internal"),
      ],
      components: [
        createComponent("External Users", "user", "internet"),
        createComponent("Internet Router", "network", "perimeter", "critical"),
        createComponent("Perimeter Firewall", "security-control", "perimeter", "critical"),
        ...(hasDmz ? [createComponent("DMZ Segment", "network", "perimeter")] : []),
        // Internal zone — sort order (network < application < data < monitoring) gives:
        // Row 1: Core Switch | Application Servers | File and Data Services
        // Row 2: Monitoring Console  (clean downward arrow from App Servers)
        createComponent("Internal Core Switch", "network", "internal", "critical"),
        createComponent("Application Servers", "application", "internal"),
        createComponent("File and Data Services", "data", "internal"),
        createComponent("Monitoring Console", "monitoring", "internal"),
      ],
      connections: [
        createConnection("external-users", "internet-router"),
        // No label — gap between adjacent boxes is too narrow for any text without overlap
        createConnection("internet-router", "perimeter-firewall"),
        ...(hasDmz
          ? [createConnection("perimeter-firewall", "dmz-segment", "Screened Traffic")]
          : []),
        createConnection("perimeter-firewall", "internal-core-switch"),
        createConnection("internal-core-switch", "application-servers"),
        // Left-to-right in same row — clean arrow
        createConnection("application-servers", "file-and-data-services"),
        // Straight down to row 2 — no cross-zone FW Logs to compete with
        createConnection("application-servers", "monitoring-console", "Logs", "dashed"),
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
        createConnection("inspection-control", "application-zone", "HTTPS"),
        createConnection("application-zone", "sensitive-data-zone"),
        createConnection("inspection-control", "monitoring-platform", "Security Logs", "dashed"),
      ],
    }, { prompt, classification });
  }

  if (classification.pattern === "core-dmz") {
    return refreshArchitectureText({
      title: "Enterprise Core Network with DMZ",
      summary: "",
      assumptions: analysis.assumptions,
      appliedChanges: [],
      zones: [
        createZone("internet", "Internet", "external"),
        createZone("dmz", "DMZ", "dmz"),
        createZone("core", "Core Network", "security-zone"),
        createZone("internal", "Internal Servers", "internal"),
      ],
      components: [
        createComponent("External Users", "user", "internet"),
        // DMZ: traffic flows left-to-right through firewall → IDS/IPS → proxy
        createComponent("Perimeter Firewall", "security-control", "dmz", "critical", 0),
        createComponent("IDS / IPS", "security-control", "dmz", "normal", 1),
        createComponent("Reverse Proxy", "network", "dmz", "normal", 2),
        // Core: clean traffic hits switch first, then internal firewall gates the servers
        createComponent("Core Switch", "network", "core", "normal", 0),
        createComponent("Internal Firewall", "security-control", "core", "critical", 1),
        createComponent("Application Server", "application", "internal"),
        createComponent("Database Server", "data", "internal"),
      ],
      connections: [
        createConnection("external-users", "perimeter-firewall", "HTTPS"),
        createConnection("perimeter-firewall", "ids-ips", "Traffic Inspection"),
        createConnection("ids-ips", "reverse-proxy", "Cleared"),
        createConnection("reverse-proxy", "core-switch", "Clean Traffic"),
        createConnection("core-switch", "internal-firewall"),
        createConnection("internal-firewall", "application-server"),
        createConnection("application-server", "database-server"),
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
      createZone("monitoring", "Monitoring", "internal"),
    ],
    components: [
      createComponent("Users / Source Systems", "user", "sources"),
      createComponent("Secure Gateway", "security-control", "control", "critical"),
      createComponent("Inspection Control", "security-control", "control", "critical"),
      createComponent("Identity Service", "identity", "services"),
      createComponent("Application Services", "application", "services"),
      createComponent("Data Services", "data", "services"),
      createComponent("Monitoring Platform", "monitoring", "monitoring"),
    ],
    connections: [
      createConnection("users-source-systems", "secure-gateway"),
      createConnection("secure-gateway", "inspection-control"),
      createConnection("inspection-control", "identity-service"),
      createConnection("identity-service", "application-services", "Policy Check"),
      createConnection("application-services", "data-services"),
      createConnection("application-services", "monitoring-platform", "Logs", "dashed"),
    ],
  }, { prompt, classification });
}

export async function generateArchitecture(
  prompt: string,
  analysis: PromptAnalysis,
): Promise<ArchitectureModel> {
  const classification = classifyPromptPattern(analysis.normalizedPrompt);

  if (shouldUseModelFallback(analysis, classification, prompt)) {
    const modelGenerated = await generateArchitectureWithModel(prompt, analysis, classification);
    if (modelGenerated) {
      return enforceArchitecturalConstraints(modelGenerated);
    }
  }

  const arch = buildScenarioArchitecture(prompt, analysis, classification);
  const rationale = PATTERN_RATIONALE[classification.pattern];
  const result = rationale ? { ...arch, securityRationale: rationale } : arch;
  return enforceArchitecturalConstraints(result);
}

export function applyFollowupInstruction(
  architecture: ArchitectureModel,
  instruction: string,
): ArchitectureModel {
  const lower = instruction.toLowerCase();
  const next: ArchitectureModel = JSON.parse(JSON.stringify(architecture));
  let changed = false;
  const appliedChanges: string[] = [];

  // Removal instructions must be handled first and return early — keyword checks
  // below (waf, siem, log) would otherwise fire on "remove the WAF" and add
  // the component instead of removing it.
  const isRemoveInstruction =
    lower.includes("remove") || lower.includes("delete") ||
    lower.includes("drop") || lower.includes("without");
  if (isRemoveInstruction) {
    const removableComponent = findComponentByInstruction(next.components, instruction);
    if (removableComponent) {
      next.components = next.components.filter((component) => component.id !== removableComponent.id);
      rewireAroundComponent(next, removableComponent.id);
      appliedChanges.push(`Removed ${removableComponent.label}.`);
      changed = true;
    }
    if (changed) {
      next.appliedChanges = [...(next.appliedChanges ?? []), ...appliedChanges];
      return refreshArchitectureText(next);
    }
  }

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
    const monitoringZone =
      next.zones.find((zone) => zone.type === "internal")?.id ??
      next.zones.find((zone) => zone.type === "security-zone")?.id ??
      next.zones[next.zones.length - 1]?.id ?? "";
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
    const monitoringZone =
      next.zones.find((zone) => zone.type === "internal")?.id ??
      next.zones.find((zone) => zone.type === "security-zone")?.id ??
      next.zones[next.zones.length - 1]?.id ?? "";
    const beforeCount = next.components.length;
    ensureComponent("Monitoring Console", "monitoring", monitoringZone);
    if (next.components.length > beforeCount) {
      appliedChanges.push("Added a monitoring console.");
    }
  }

  if (lower.includes("logging") || lower.includes("log")) {
    const internalZone =
      next.zones.find((zone) => zone.type === "internal")?.id ??
      next.zones.find((zone) => zone.type === "security-zone")?.id ??
      next.zones[next.zones.length - 1]?.id ?? "";
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
      next.zones.find((zone) => zone.type === "dmz" || zone.type === "security-zone")?.id ?? next.zones[0]?.id ?? "";
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
    const internalZone =
      next.zones.find((zone) => zone.type === "internal")?.id ??
      next.zones.find((zone) => zone.type === "security-zone")?.id ??
      next.zones[next.zones.length - 1]?.id ?? "";
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

  if (!changed && instruction.trim()) {
    appliedChanges.push(`Captured follow-up request: ${instruction.trim()}.`);
  }

  next.appliedChanges = [...(next.appliedChanges ?? []), ...appliedChanges];

  return refreshArchitectureText(next);
}

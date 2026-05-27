import type { ArchitectureModel, ArchitectureComponent, ArchitectureZone } from "../../../shared/types/architecture.js";
import type { DiagramLayout, DiagramSeed } from "../../../shared/types/diagram.js";

/** Increment whenever the layout algorithm changes, to auto-bust the diagram cache. */
export const LAYOUT_VERSION = "L2";

// ─── Layout constants ────────────────────────────────────────────────────────
const CANVAS_PADDING = 80;
const CANVAS_MIN_WIDTH = 1400;          // gives ≥ 1240px unified zone width
const ZONE_GAP = 92;
const ZONE_PADDING_X = 30;
const ZONE_PADDING_Y = 36;  // label height = TEXT_LINE_HEIGHT+4 = 26px; 36px gives 10px margin
const MIN_COMPONENT_HEIGHT = 72;
const COMPONENT_GAP_X = 42;
const COMPONENT_GAP_Y = 28;
const TEXT_LINE_HEIGHT = 22;
const MAX_ROW_COMPONENTS = 3;
const STRAIGHT_ARROW_THRESHOLD = 24;
const LABEL_CLEARANCE = 18;
const SOLID_LABEL_MAX_CHARS = 22;
const DASHED_LABEL_MAX_CHARS = 32;
const TITLE_MAX_CHARS_PER_LINE = 22;
const ZONE_TITLE_CHAR_WIDTH = 15;       // used only for zone-title min-width estimate

// Conservative overestimate of Excalifont glyph width at fontSize 18.
// Used ONLY to derive charsPerLine from boxWidth — never for box sizing.
// Overestimating causes more line-breaks but guarantees no horizontal truncation.
const CHAR_ESTIMATE = 22;

// ─── Derived sizing helpers ──────────────────────────────────────────────────

/**
 * Width of a single component box when `rowLen` components share a zone row.
 * All components in a row get equal width so the row exactly fills the zone.
 */
function computeBoxWidth(rowLen: number, zoneWidth: number): number {
  const totalGaps = Math.max(0, rowLen - 1) * COMPONENT_GAP_X;
  return Math.floor((zoneWidth - 2 * ZONE_PADDING_X - totalGaps) / rowLen);
}

/**
 * Maximum characters per line that will fit inside a box of `boxWidth`.
 * Derived from the box width — text is wrapped server-side to this limit so
 * that the rendered line is always narrower than the text-element width.
 */
function computeCharsPerLine(boxWidth: number): number {
  // Reserve 8px (4px each side) inside the box for the border gap.
  return Math.max(6, Math.floor((boxWidth - 8) / CHAR_ESTIMATE));
}

// ─── Colors ──────────────────────────────────────────────────────────────────

type ComponentStyle = { bg: string; stroke: string };

// Each component type gets a distinct hue. Critical importance uses a deeper tint
// of the same hue so the visual hierarchy is clear without extra stroke width.
const componentStyles: Record<ArchitectureComponent["type"], { normal: ComponentStyle; critical: ComponentStyle }> = {
  user:               { normal: { bg: "#dbeafe", stroke: "#2563eb" }, critical: { bg: "#bfdbfe", stroke: "#1d4ed8" } },
  network:            { normal: { bg: "#e0e7ff", stroke: "#4338ca" }, critical: { bg: "#c7d2fe", stroke: "#3730a3" } },
  "security-control": { normal: { bg: "#fee2e2", stroke: "#dc2626" }, critical: { bg: "#fecaca", stroke: "#b91c1c" } },
  identity:           { normal: { bg: "#ede9fe", stroke: "#7c3aed" }, critical: { bg: "#ddd6fe", stroke: "#6d28d9" } },
  application:        { normal: { bg: "#dcfce7", stroke: "#16a34a" }, critical: { bg: "#bbf7d0", stroke: "#15803d" } },
  data:               { normal: { bg: "#d1fae5", stroke: "#059669" }, critical: { bg: "#a7f3d0", stroke: "#047857" } },
  monitoring:         { normal: { bg: "#fef3c7", stroke: "#d97706" }, critical: { bg: "#fde68a", stroke: "#b45309" } },
  integration:        { normal: { bg: "#f1f5f9", stroke: "#64748b" }, critical: { bg: "#e2e8f0", stroke: "#475569" } },
};

/**
 * Logical constructs (tunnels, virtual overlays) are not physical devices.
 * They render with a dashed border to match standard network diagram conventions.
 */
function isLogicalConstruct(label: string): boolean {
  return /\btunnel\b|\bvirtual link\b|\boverlay\b|\bvpn path\b/i.test(label);
}

function componentStyle(component: ArchitectureComponent, architecture: ArchitectureModel): ComponentStyle {
  const label = component.label.toLowerCase();
  const isCritical = component.importance === "critical";

  // Wireless-specific overrides — keep visual distinction between SSID types
  if (architecture.title.includes("Wi-Fi") || architecture.title.includes("Wireless Network")) {
    if (label.includes("guest") && label.includes("ssid")) return { bg: "#fef9c3", stroke: "#ca8a04" };
    if ((label.includes("internal") || label.includes("corporate")) && label.includes("ssid")) return { bg: "#bfdbfe", stroke: "#2563eb" };
    if (label.includes("private vlan")) return { bg: "#bbf7d0", stroke: "#16a34a" };
    if (label.includes("internet-only vlan")) return { bg: "#fed7aa", stroke: "#ea580c" };
  }

  const styles = componentStyles[component.type];
  return isCritical ? styles.critical : styles.normal;
}

// ─── Zone ordering ───────────────────────────────────────────────────────────

// Legacy title-based zone ordering. Static patterns set zone.order directly so
// sortZones returns before reaching this table. Claude-generated architectures
// without zone.order fall through to ZONE_TYPE_ORDER below, which handles the
// external→dmz→security-zone→internal→cloud ordering correctly. This table is
// kept empty; entries were removed when all static patterns adopted zone.order.
const preferredZoneOrders: Array<{
  match: (architecture: ArchitectureModel) => boolean;
  order: string[];
}> = [];

function zoneColor(zoneType: ArchitectureZone["type"]) {
  switch (zoneType) {
    case "external":
      return { background: "#fff3ee", stroke: "#c2692b", titleColor: "#7c3610" };
    case "dmz":
      return { background: "#fffbec", stroke: "#b59b20", titleColor: "#7a6400" };
    case "security-zone":
      return { background: "#f0fff4", stroke: "#3a9b52", titleColor: "#1a6e35" };
    case "internal":
      return { background: "#eef4ff", stroke: "#3b5bdb", titleColor: "#1a3bbd" };
    case "cloud":
      return { background: "#f0f9ff", stroke: "#0284c7", titleColor: "#0369a1" };
    case "branch":
      return { background: "#fdf4ff", stroke: "#9333ea", titleColor: "#7e22ce" };
    case "data-center":
      return { background: "#f8fafc", stroke: "#475569", titleColor: "#334155" };
    default:
      return { background: "#f9fafb", stroke: "#6b7280", titleColor: "#374151" };
  }
}

// ─── Label helpers ───────────────────────────────────────────────────────────

function shortenLabel(label: string) {
  const replacements: Array<[RegExp, string]> = [
    [/Identity \/ Directory/gi, "Identity"],
    [/Identity \/ Access Control/gi, "Identity Control"],
    [/Monitoring \/ SIEM/gi, "SIEM"],
    [/VPC \/ Virtual Network/gi, "VPC"],
    [/Reverse Proxy \/ Load Balancer/gi, "Reverse Proxy / LB"],
    [/Users \/ Source Systems/gi, "Users / Sources"],
    [/Application Entry Point/gi, "App Entry"],
    [/Cloud Application Tier/gi, "Cloud App Tier"],
    [/Traffic Scrubbing Layer/gi, "Scrubbing Layer"],
    [/Policy \/ Response Workflow/gi, "Response Workflow"],
    [/Alerting \/ Case Output/gi, "Alerting / Cases"],
    [/Alerting \/ SOC/gi, "Alerting / SOC"],
    [/Edge Protection Appliance/gi, "Edge Protection"],
    [/Application Server Cluster/gi, "App Server Cluster"],
    [/Security Management Console/gi, "Security Console"],
    [/On-Prem Application Segment/gi, "On-Prem Apps"],
    [/On-Prem Core Network/gi, "Core Network"],
    [/Central Security Gateway/gi, "Central Gateway"],
    [/Cloud Firewall \/ SWG/gi, "Cloud FW / SWG"],
    [/Internal Applications/gi, "Internal Apps"],
  ];

  return replacements.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), label);
}

function wrapText(text: string, maxChars: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      return;
    }

    if (current) {
      lines.push(current);
    }
    current = word;
  });

  if (current) {
    lines.push(current);
  }

  return lines;
}

// ─── Size computation ─────────────────────────────────────────────────────────

function getTitleSize(label: string) {
  const lines = wrapText(label, TITLE_MAX_CHARS_PER_LINE);
  const widestLine = Math.max(...lines.map((line) => line.length), 8);
  return {
    lines,
    // Width used only as a zone minimum — always overridden by CANVAS_MIN_WIDTH in practice
    width: Math.ceil(widestLine * ZONE_TITLE_CHAR_WIDTH) + 36,
    height: lines.length * TEXT_LINE_HEIGHT + 10,
  };
}

/**
 * Layout-driven component sizing.
 * `boxWidth` is determined by the zone layout (zone width ÷ row count), NOT by text length.
 * Text is wrapped to fit the box; the box is never narrowed to fit the text.
 */
function getComponentSize(label: string, boxWidth: number) {
  const displayLabel = shortenLabel(label);
  const charsPerLine = computeCharsPerLine(boxWidth);
  const lines = wrapText(displayLabel, charsPerLine);
  return {
    displayLabel,
    lines,
    width: boxWidth,
    height: Math.max(MIN_COMPONENT_HEIGHT, lines.length * TEXT_LINE_HEIGHT + 34),
  };
}

// ─── Row / zone helpers ───────────────────────────────────────────────────────

function getRows(components: ArchitectureComponent[]) {
  if (components.length <= MAX_ROW_COMPONENTS) {
    return [components];
  }

  const rows: ArchitectureComponent[][] = [];
  let index = 0;
  while (index < components.length) {
    rows.push(components.slice(index, index + MAX_ROW_COMPONENTS));
    index += MAX_ROW_COMPONENTS;
  }
  return rows;
}

// Default zone type order — used when no preferredZoneOrders entry matches.
// Ensures Claude-generated architectures always render internet-facing zones first.
const ZONE_TYPE_ORDER: Record<ArchitectureZone["type"], number> = {
  external:        0,
  dmz:             1,
  "security-zone": 2,
  branch:          3,
  cloud:           3,
  internal:        4,
  "data-center":   5,
};

function sortZones(architecture: ArchitectureModel) {
  // ── Fast path: explicit order field set on zones ──────────────────────────
  // Static patterns assign zone.order directly so sortZones never needs to
  // match on architecture.title. This is the canonical path for all static
  // patterns; the preferredZoneOrders table below is kept as a legacy fallback
  // for any cached or Claude-generated architecture that lacks explicit order.
  if (architecture.zones.some((z) => z.order !== undefined)) {
    return [...architecture.zones].sort((a, b) => {
      const ao = a.order ?? (ZONE_TYPE_ORDER[a.type] ?? 3) * 100;
      const bo = b.order ?? (ZONE_TYPE_ORDER[b.type] ?? 3) * 100;
      if (ao !== bo) return ao - bo;
      return architecture.zones.indexOf(a) - architecture.zones.indexOf(b);
    });
  }

  // ── Legacy path: title-based preferred orders ────────────────────────────
  const preferred = preferredZoneOrders.find((entry) => entry.match(architecture));
  if (preferred) {
    return [...architecture.zones].sort((a, b) => {
      const ai = preferred.order.indexOf(a.id);
      const bi = preferred.order.indexOf(b.id);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  }

  // ── Fallback: sort by zone type ──────────────────────────────────────────
  return [...architecture.zones].sort((a, b) => {
    const ai = ZONE_TYPE_ORDER[a.type] ?? 3;
    const bi = ZONE_TYPE_ORDER[b.type] ?? 3;
    if (ai !== bi) return ai - bi;
    // sortPriority tie-break: explicit field takes precedence over heuristics.
    if ((a.sortPriority ?? 0) !== (b.sortPriority ?? 0)) return (a.sortPriority ?? 0) - (b.sortPriority ?? 0);
    // Monitoring zones always render last within their type group — prevents upward arrows
    // from application components when Claude generates monitoring as security-zone type.
    // Label/id heuristic is the last resort for Claude-generated zones without sortPriority.
    const aIsMonitor = /monitor/i.test(a.id) || /monitor/i.test(a.label);
    const bIsMonitor = /monitor/i.test(b.id) || /monitor/i.test(b.label);
    if (aIsMonitor !== bIsMonitor) return aIsMonitor ? 1 : -1;
    // Stable tie-break: preserve original array order
    return architecture.zones.indexOf(a) - architecture.zones.indexOf(b);
  });
}

function sortComponents(architecture: ArchitectureModel, zoneId: string) {
  const components = architecture.components.filter((component) => component.zoneId === zoneId);
  return [...components].sort((a, b) => {
    // Explicit display order takes priority — used when connection flow doesn't match type order
    if (a.displayOrder !== undefined && b.displayOrder !== undefined) {
      return a.displayOrder - b.displayOrder;
    }
    if (a.displayOrder !== undefined) return -1;
    if (b.displayOrder !== undefined) return 1;

    const weight = (component: ArchitectureComponent) => {
      const importance = component.importance === "critical" ? 0 : 1;
      const typeWeight: Record<ArchitectureComponent["type"], number> = {
        user: 0,
        network: 1,
        "security-control": 2,
        identity: 3,
        application: 4,
        data: 5,
        monitoring: 6,
        integration: 7,
      };
      return importance * 10 + typeWeight[component.type];
    };

    return weight(a) - weight(b);
  });
}

// ─── Arrow routing ────────────────────────────────────────────────────────────

function getLabelOffset(index: number) {
  return index % 2 === 0 ? -16 : 14;
}

function shouldRenderConnectionLabel(label: string, from: Box, to: Box, style?: "solid" | "dashed") {
  // Same-row adjacent connections have only COMPONENT_GAP_X (42px) of horizontal
  // space — not enough for any label without overlapping the adjacent component box.
  const sameRow = Math.abs(from.y - to.y) < Math.max(from.height, to.height) * 0.6;
  if (sameRow) {
    const gap = to.x > from.x
      ? to.x - (from.x + from.width)
      : from.x - (to.x + to.width);
    // 80px threshold is intentionally conservative: COMPONENT_GAP_X is 42px,
    // but the additional ~38px of inter-component space is still too narrow for
    // short labels (≤8 chars) to render without clipping on the component border.
    // Raising this threshold risks overlapping labels on adjacent components.
    if (gap < 80) return false;
  }

  if (style === "dashed") return label.length <= DASHED_LABEL_MAX_CHARS;
  return label.length <= SOLID_LABEL_MAX_CHARS;
}

type Box = { x: number; y: number; width: number; height: number };

function centerX(box: Box) {
  return box.x + box.width / 2;
}

function centerY(box: Box) {
  return box.y + box.height / 2;
}

function rightX(box: Box) {
  return box.x + box.width;
}

function routeArrow(from: Box, to: Box, index: number, crossZone = false): { startX: number; startY: number; points: Array<[number, number]> } {
  // cross-zone connections can never be same-row regardless of Y proximity —
  // they connect components in distinct bands and must always route vertically.
  const sameRow = !crossZone && Math.abs(from.y - to.y) < Math.max(from.height, to.height) * 0.6;
  const horizontalNeighbor =
    sameRow && (to.x >= from.x + from.width - 4 || from.x >= to.x + to.width - 4);

  if (horizontalNeighbor) {
    if (to.x > from.x) {
      const startX = rightX(from);
      const startY = centerY(from);
      const endX = to.x;
      const endY = centerY(to);
      const dx = endX - startX;
      const dy = endY - startY;

      // Non-adjacent same-row: straight line from right edge of `from` to left
      // edge of `to` at center Y. Component boxes render on top of connections
      // (z-order), so any intermediate box hides the overlapping segment.
      // The previous DROP routing placed a horizontal band in the inter-row gap
      // (28 px) which was fully visible — this avoids it.
      if (dx > from.width + COMPONENT_GAP_X) {
        return {
          startX: rightX(from),
          startY: centerY(from),
          points: [
            [0, 0],
            [to.x - rightX(from), centerY(to) - centerY(from)],
          ],
        };
      }

      const points: Array<[number, number]> =
        Math.abs(dy) < 8
          ? [
              [0, 0],
              [dx, 0],
            ]
          : [
              [0, 0],
              [Math.max(12, dx * 0.4), 0],
              [dx - Math.max(12, dx * 0.4), dy],
              [dx, dy],
            ];

      return { startX, startY, points };
    }

    const startX = from.x;
    const startY = centerY(from);
    const endX = rightX(to);
    const endY = centerY(to);
    return {
      startX,
      startY,
      points: [
        [0, 0],
        [endX - startX, endY - startY],
      ],
    };
  }

  if (!sameRow && from.y > to.y) {
    const startX = centerX(from);
    const startY = from.y;
    const endX = centerX(to);
    const endY = to.y + to.height; // arrive at bottom edge, not top — arrow comes from below
    const dx = endX - startX;
    const dy = endY - startY;

    if (Math.abs(dx) <= STRAIGHT_ARROW_THRESHOLD) {
      return {
        startX,
        startY,
        points: [
          [0, 0],
          [dx, dy],
        ],
      };
    }

    const verticalPull = Math.max(28, Math.min(60, Math.abs(dy) / 3));
    const sideStep = index % 2 === 0 ? -32 : 32;
    return {
      startX,
      startY,
      points: [
        [0, 0],
        [0, -verticalPull],
        [dx + sideStep, -verticalPull],
        [dx, dy],
      ],
    };
  }

  const startX = centerX(from);
  const startY = from.y + from.height;
  const endX = centerX(to);
  const endY = to.y;
  const dx = endX - startX;
  const dy = endY - startY;

  if (Math.abs(dx) <= STRAIGHT_ARROW_THRESHOLD) {
    return {
      startX,
      startY,
      points: [
        [0, 0],
        [dx, dy],
      ],
    };
  }

  // Intra-zone cross-row with small dy: skip the bent lane.
  // A bent path with dy < 80 px places its horizontal segment inside the
  // ~28 px inter-row gap — fully visible, no component box covers it.
  // A direct diagonal avoids the gap entirely.
  if (!crossZone && dy < 80) {
    return {
      startX,
      startY,
      points: [
        [0, 0],
        [dx, dy],
      ],
    };
  }

  // For cross-zone arrows: place the horizontal bend segment inside the
  // destination zone (just above the destination component), not in the
  // inter-zone gap where the line has no background and is fully exposed.
  // For intra-zone cross-row arrows: keep the bend near the source row.
  const laneOffset = crossZone
    ? dy - Math.max(16, Math.min(28, Math.abs(dy) * 0.12))
    : Math.max(28, Math.min(56, Math.abs(dy) / 2));

  return {
    startX,
    startY,
    points: [
      [0, 0],
      [0, laneOffset],
      [dx, laneOffset],
      [dx, dy],
    ],
  };
}

function arrowLabelPosition(
  startX: number,
  startY: number,
  points: Array<[number, number]>,
  index: number,
  labelText: string,
  crossZone = false,
  destZoneTop?: number,
): { x: number; y: number } {
  const endPoint = points[points.length - 1] ?? [0, 0];
  const endX = startX + endPoint[0];
  const endY = startY + endPoint[1];
  const labelWidth = Math.min(labelText.length * 7, 140);

  // Cross-zone downward: anchor label inside destination zone's top padding using
  // exact zone geometry when available, otherwise fall back to component-relative math.
  // Formula: zone top + title height is where components start; we sit just above the
  // first component at zone_top + ZONE_PADDING_Y - TEXT_LINE_HEIGHT - 4.
  // When destZoneTop is unknown, endY - TEXT_LINE_HEIGHT - 4 approximates the same spot.
  const crossZoneDownLabel = (anchorX: number): { x: number; y: number } => {
    const y = destZoneTop !== undefined
      ? destZoneTop + ZONE_PADDING_Y - TEXT_LINE_HEIGHT - 4
      : endY - TEXT_LINE_HEIGHT - 4;
    return { x: anchorX + LABEL_CLEARANCE, y };
  };

  if (points.length === 2) {
    const midX = startX + endPoint[0] / 2;
    const midY = startY + endPoint[1] / 2;
    const isHorizontal = Math.abs(endPoint[1]) < Math.abs(endPoint[0]) * 0.3;
    if (isHorizontal) {
      return { x: midX - labelWidth / 2, y: midY - 20 };
    }
    const arrowHeight = Math.abs(endPoint[1]);
    const targetTopY = startY + endPoint[1];
    // Long straight vertical arrows spanning zones — place label in destination zone.
    if (arrowHeight > 150) {
      if (crossZone && endY > startY) {
        return crossZoneDownLabel(endX);
      }
      const nearTopY = startY + 40;
      const clampedY = Math.min(nearTopY, targetTopY - TEXT_LINE_HEIGHT - 4);
      return { x: midX + LABEL_CLEARANCE, y: clampedY };
    }
    // Short vertical arrow — midpoint label is fine.
    const rawY = midY + getLabelOffset(index);
    const clampedY = Math.min(rawY, targetTopY - TEXT_LINE_HEIGHT - 4);
    return { x: midX + LABEL_CLEARANCE, y: clampedY };
  }

  const midPoint = points[1] ?? [0, 0];
  const laneY = startY + midPoint[1];
  const midX = (startX + endX) / 2;
  // Bent-path cross-zone downward arrow: same destination-zone anchoring rule.
  if (crossZone && endY > startY) {
    return crossZoneDownLabel(endX);
  }
  // For downward arrows place the label BELOW the lane point (in the inter-zone gap).
  // For upward arrows keep it above the lane.
  return {
    x: midX - labelWidth / 2,
    y: laneY + (endY > startY ? LABEL_CLEARANCE + 2 : -LABEL_CLEARANCE - 2),
  };
}

// ─── Main layout entry point ──────────────────────────────────────────────────

export function layoutArchitecture(architecture: ArchitectureModel): {
  layout: DiagramLayout;
  elements: DiagramSeed[];
} {
  const elements: DiagramSeed[] = [];
  const connectionElements: DiagramSeed[] = [];
  const componentElements: DiagramSeed[] = [];
  const componentBoxes = new Map<string, Box>();
  /** Top Y coordinate of each rendered zone — used for exact arrow-label placement. */
  const zoneTopY = new Map<string, number>();
  const zoneOrder = sortZones(architecture);
  let currentY = CANVAS_PADDING;
  let maxWidth = 0;

  // ── Pass 1: determine unified zone width ──────────────────────────────────
  type ZoneMeta = {
    title: ReturnType<typeof getTitleSize>;
    rows: ArchitectureComponent[][];
    rowHeights: number[];
    height: number;
    zoneWidth: number; // actual rendered width (narrower for parallel zones)
  };

  const zoneMeta = new Map<string, ZoneMeta>();

  // Minimum unified zone width: max of all title minimums and the canvas minimum.
  let minZoneWidth = CANVAS_MIN_WIDTH - CANVAS_PADDING * 2;
  for (const zone of zoneOrder) {
    const title = getTitleSize(zone.label);
    minZoneWidth = Math.max(minZoneWidth, ZONE_PADDING_X * 2 + title.width);
  }
  const unifiedZoneWidth = minZoneWidth;

  // ── Group zones by row value ───────────────────────────────────────────────
  // Zones sharing the same numeric `row` render side-by-side. Zones without a
  // `row` value each occupy their own full-width row group.
  type ZoneGroup = { row: number | undefined; zones: ArchitectureZone[] };
  const zoneGroups: ZoneGroup[] = [];
  for (const zone of zoneOrder) {
    if (zone.row !== undefined) {
      const existing = zoneGroups.find((g) => g.row === zone.row);
      if (existing) {
        existing.zones.push(zone);
      } else {
        zoneGroups.push({ row: zone.row, zones: [zone] });
      }
    } else {
      zoneGroups.push({ row: undefined, zones: [zone] });
    }
  }

  function perZoneWidth(groupSize: number): number {
    if (groupSize <= 1) return unifiedZoneWidth;
    return Math.floor((unifiedZoneWidth - (groupSize - 1) * ZONE_GAP) / groupSize);
  }

  // ── Pass 2: compute row heights now that boxWidths are known ──────────────
  for (const group of zoneGroups) {
    const zw = perZoneWidth(group.zones.length);
    for (const zone of group.zones) {
      const components = sortComponents(architecture, zone.id);
      const rows = getRows(components);
      const title = getTitleSize(zone.label);

      const rowHeights = rows.map((row) => {
        const boxWidth = computeBoxWidth(row.length, zw);
        return row.reduce((h, component) => {
          const size = getComponentSize(component.label, boxWidth);
          return Math.max(h, size.height);
        }, MIN_COMPONENT_HEIGHT);
      });

      const height =
        title.height +
        ZONE_PADDING_Y * 2 +
        rowHeights.reduce((sum, rh) => sum + rh, 0) +
        Math.max(0, rowHeights.length - 1) * COMPONENT_GAP_Y;

      zoneMeta.set(zone.id, { title, rows, rowHeights, height, zoneWidth: zw });
    }
  }

  // ── Render zones ──────────────────────────────────────────────────────────
  for (const group of zoneGroups) {
    const groupHeight = Math.max(...group.zones.map((z) => zoneMeta.get(z.id)?.height ?? 0));
    const zw = perZoneWidth(group.zones.length);

    group.zones.forEach((zone, groupIndex) => {
      const meta = zoneMeta.get(zone.id);
      if (!meta) return;

      const { title, rows, rowHeights } = meta;
      const zoneWidth = zw;
      const zoneX = CANVAS_PADDING + groupIndex * (zoneWidth + ZONE_GAP);
      const zoneY = currentY;
      zoneTopY.set(zone.id, zoneY);
      const zoneColors = zoneColor(zone.type);

      // Stretch the last zone to fill any rounding remainder
      const isLast = groupIndex === group.zones.length - 1;
      const renderedWidth = isLast
        ? unifiedZoneWidth - groupIndex * (zoneWidth + ZONE_GAP)
        : zoneWidth;

      elements.push({
        id: `${zone.id}-container`,
        type: "rectangle",
        x: zoneX,
        y: zoneY,
        width: renderedWidth,
        height: groupHeight,            // all sibling zones share the same height
        strokeColor: zoneColors.stroke,
        backgroundColor: zoneColors.background,
        fillStyle: "solid",
        roughness: 0,
      });

      // Zone title — give the full zone width so it never truncates
      elements.push({
        id: `${zone.id}-title`,
        type: "text",
        x: zoneX + 16,
        y: zoneY + 10,
        width: renderedWidth - 20,
        text: title.lines.join("\n"),
        fontSize: 22,
        strokeColor: zoneColors.titleColor,
      });

      let runningY = zoneY + title.height + ZONE_PADDING_Y;

      rows.forEach((row, rowIndex) => {
        // All components in the row share equal width; the row fills the zone exactly.
        const boxWidth = computeBoxWidth(row.length, renderedWidth);
        let componentX = zoneX + ZONE_PADDING_X;
        const componentY = runningY;

        row.forEach((component) => {
          const size = getComponentSize(component.label, boxWidth);
          const style = componentStyle(component, architecture);

          componentElements.push({
            id: `${component.id}-box`,
            type: "rectangle",
            x: componentX,
            y: componentY,
            width: size.width,
            height: rowHeights[rowIndex],   // all boxes in row share the same height
            strokeColor: style.stroke,
            backgroundColor: style.bg,
            fillStyle: "solid",
            strokeStyle: isLogicalConstruct(component.label) ? "dashed" : "solid",
            roughness: 0,
          });

          componentElements.push({
            id: `${component.id}-label`,
            type: "text",
            x: componentX + 8,
            y: componentY + 14,
            width: size.width,              // full box width — frontend uses this directly as bounding box
            text: size.lines.join("\n"),
            fontSize: 18,
            strokeColor: "#18181b",
            containerId: `${component.id}-box`,
          });

          componentBoxes.set(component.id, {
            x: componentX,
            y: componentY,
            width: size.width,
            height: rowHeights[rowIndex],
          });

          componentX += boxWidth + COMPONENT_GAP_X;
        });

        runningY += rowHeights[rowIndex] + COMPONENT_GAP_Y;
      });
    });

    currentY += groupHeight + ZONE_GAP;
    maxWidth = Math.max(maxWidth, unifiedZoneWidth + CANVAS_PADDING * 2);
  }

  // ── Render connections ────────────────────────────────────────────────────
  // Build component → zoneId map so routeArrow can distinguish cross-zone connections.
  const componentToZone = new Map<string, string>();
  for (const comp of architecture.components) componentToZone.set(comp.id, comp.zoneId);

  const renderedTargetLabels = new Map<string, Set<string>>();
  const labeledConnectionsPerSource = new Map<string, number>();

  architecture.connections.forEach((connection, index) => {
    const from = componentBoxes.get(connection.from);
    const to = componentBoxes.get(connection.to);
    if (!from || !to) {
      return;
    }
    const fromZone = componentToZone.get(connection.from);
    const toZone = componentToZone.get(connection.to);
    const crossZone = fromZone !== undefined && toZone !== undefined && fromZone !== toZone;
    const { startX, startY, points } = routeArrow(from, to, index, crossZone);

    connectionElements.push({
      id: connection.id,
      type: "arrow",
      x: startX,
      y: startY,
      points,
      strokeColor: connection.style === "dashed" ? "#6b7280" : "#374151",
      strokeStyle: connection.style === "dashed" ? "dashed" : "solid",
      roughness: 0,
    });

    if (connection.label && shouldRenderConnectionLabel(connection.label, from, to, connection.style)) {
      const labelText = shortenLabel(connection.label);

      // Suppress duplicate label on the same target (fan-in congestion)
      const targetLabels = renderedTargetLabels.get(connection.to) ?? new Set<string>();
      if (targetLabels.has(labelText)) {
        renderedTargetLabels.set(connection.to, targetLabels);
        return;
      }
      targetLabels.add(labelText);
      renderedTargetLabels.set(connection.to, targetLabels);

      // Suppress more than 1 solid label per source (fan-out congestion)
      if (connection.style !== "dashed") {
        const sourceCount = labeledConnectionsPerSource.get(connection.from) ?? 0;
        if (sourceCount >= 1) {
          labeledConnectionsPerSource.set(connection.from, sourceCount + 1);
          return;
        }
        labeledConnectionsPerSource.set(connection.from, sourceCount + 1);
      }

      const destZoneTop = toZone ? zoneTopY.get(toZone) : undefined;
      const { x: labelX, y: labelY } = arrowLabelPosition(startX, startY, points, index, labelText, crossZone, destZoneTop);
      const labelWidth = Math.max(160, labelText.length * 12 + 24);
      const labelHeight = TEXT_LINE_HEIGHT + 4;
      // White backing rectangle — rendered before the text so zone backgrounds
      // and dashed arrow lines never bleed through the label characters.
      connectionElements.push({
        id: `${connection.id}-label-bg`,
        type: "rectangle",
        x: labelX - 3,
        y: labelY - 1,
        width: labelWidth + 6,
        height: labelHeight,
        strokeColor: "#ffffff",
        backgroundColor: "#ffffff",
        fillStyle: "solid",
        roughness: 0,
      });
      connectionElements.push({
        id: `${connection.id}-label`,
        type: "text",
        x: labelX,
        y: labelY,
        width: labelWidth,
        text: labelText,
        fontSize: 16,
        strokeColor: "#3f3f46",
      });
    }
  });

  // Z-order: zone backgrounds → connections (drawn under) → component boxes (drawn on top).
  // Component boxes must render last so they occlude arrow lines that pass through
  // intermediate zones, preventing the visual artifact where a skip-zone arrow appears
  // to originate from the top of an intervening component.
  elements.push(...connectionElements, ...componentElements);

  return {
    layout: {
      width: Math.max(maxWidth, CANVAS_MIN_WIDTH),
      height: Math.max(currentY, 900),
    },
    elements,
  };
}

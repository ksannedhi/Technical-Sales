import type { ArchitectureModel, ArchitectureComponent, ArchitectureZone } from "../../../shared/types/architecture.js";
import type { DiagramLayout, DiagramSeed } from "../../../shared/types/diagram.js";

const CANVAS_PADDING = 80;
const ZONE_GAP = 92;
const ZONE_PADDING_X = 30;
const ZONE_PADDING_Y = 28;
const MIN_COMPONENT_WIDTH = 180;
const MIN_COMPONENT_HEIGHT = 72;
const COMPONENT_GAP_X = 42;
const COMPONENT_GAP_Y = 28;
const TEXT_CHAR_WIDTH = 10.4;
const MAX_CHARS_PER_LINE = 16;
const TEXT_LINE_HEIGHT = 22;
const MAX_ROW_COMPONENTS = 3;
const ZONE_TITLE_CHAR_WIDTH = 12.4;
const STRAIGHT_ARROW_THRESHOLD = 24;
const LABEL_CLEARANCE = 18;
const TITLE_MAX_CHARS_PER_LINE = 22;
const SOLID_LABEL_MAX_CHARS = 22;
const DENSE_PATTERN_MAX_CHARS_PER_LINE = 14;

const componentColors: Record<ArchitectureComponent["type"], string> = {
  user: "#ffffff",
  network: "#ffffff",
  "security-control": "#f7b3ae",
  identity: "#b8d4ff",
  application: "#ffffff",
  data: "#dbe8c9",
  monitoring: "#f2d79f",
  integration: "#ffffff",
};

function componentColor(component: ArchitectureComponent, architecture: ArchitectureModel) {
  const label = component.label.toLowerCase();

  if (architecture.title.includes("Wi-Fi") || architecture.title.includes("Wireless Network")) {
    if (label.includes("guest") && label.includes("ssid")) {
      return "#f8f0b8";
    }

    if ((label.includes("internal") || label.includes("corporate")) && label.includes("ssid")) {
      return "#cfe4f8";
    }

    if (label.includes("private vlan")) {
      return "#d8ead0";
    }

    if (label.includes("internet-only vlan")) {
      return "#f7e2c4";
    }
  }

  return componentColors[component.type];
}

const preferredZoneOrders: Array<{
  match: (architecture: ArchitectureModel) => boolean;
  order: string[];
}> = [
  {
    match: (architecture) => architecture.title.includes("Hybrid Connectivity"),
    order: ["onprem", "connectivity", "cloud"],
  },
  {
    match: (architecture) => architecture.title.includes("WAF"),
    order: ["internet", "edge", "dmz", "internal"],
  },
  {
    match: (architecture) => architecture.title.includes("DDoS"),
    order: ["internet", "scrubbing", "edge", "internal"],
  },
  {
    match: (architecture) => architecture.title.includes("Sandbox"),
    order: ["sources", "inspection", "operations"],
  },
  {
    match: (architecture) => architecture.title.includes("Wireless Network"),
    order: ["upstream", "wireless", "policy"],
  },
  {
    match: (architecture) => architecture.title.includes("Partner API Security"),
    order: ["partner", "edge", "api", "identity", "backend"],
  },
  {
    match: (architecture) => architecture.title.includes("Hybrid Identity and Cloud"),
    order: ["cloud", "identity", "onprem"],
  },
  {
    match: (architecture) => architecture.title.includes("Secure Messaging Protection"),
    order: ["internet", "dmz", "internal", "clients"],
  },
];

function zoneColor(zone: ArchitectureZone["type"]) {
    switch (zone) {
      case "dmz":
        return "#f7f4f1";
      case "cloud":
        return "#eef3fb";
      case "security-zone":
        return "#fcfbf8";
      default:
        return "#fbfbfb";
    }
  }

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
  ];

  return replacements.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), label);
}

function getComponentWrapLimit(architecture: ArchitectureModel) {
  return architecture.components.length > 10 ? DENSE_PATTERN_MAX_CHARS_PER_LINE : MAX_CHARS_PER_LINE;
}

function wrapText(text: string, maxChars = MAX_CHARS_PER_LINE) {
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

function getTitleSize(label: string) {
  const lines = wrapText(label, TITLE_MAX_CHARS_PER_LINE);
  const widestLine = Math.max(...lines.map((line) => line.length), 8);
  return {
    lines,
    width: Math.ceil(widestLine * ZONE_TITLE_CHAR_WIDTH) + 36,
    height: lines.length * TEXT_LINE_HEIGHT + 10,
  };
}

function getComponentSize(label: string, architecture: ArchitectureModel) {
  const displayLabel = shortenLabel(label);
  const lines = wrapText(displayLabel, getComponentWrapLimit(architecture));
  const widestLine = Math.max(...lines.map((line) => line.length), 8);
  return {
    displayLabel,
    lines,
    width: Math.max(MIN_COMPONENT_WIDTH, Math.ceil(widestLine * TEXT_CHAR_WIDTH) + 42),
    height: Math.max(MIN_COMPONENT_HEIGHT, lines.length * TEXT_LINE_HEIGHT + 34),
  };
}

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

function getRowWidth(row: ArchitectureComponent[], architecture: ArchitectureModel) {
  return row.reduce((sum, component, index) => {
    const { width } = getComponentSize(component.label, architecture);
    return sum + width + (index > 0 ? COMPONENT_GAP_X : 0);
  }, 0);
}

function sortZones(architecture: ArchitectureModel) {
  const preferred = preferredZoneOrders.find((entry) => entry.match(architecture));
  if (!preferred) {
    return architecture.zones;
  }

  return [...architecture.zones].sort((a, b) => {
    const ai = preferred.order.indexOf(a.id);
    const bi = preferred.order.indexOf(b.id);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}

function sortComponents(architecture: ArchitectureModel, zoneId: string) {
  const components = architecture.components.filter((component) => component.zoneId === zoneId);
  return [...components].sort((a, b) => {
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

function getLabelOffset(index: number) {
  return index % 2 === 0 ? -16 : 14;
}

function shouldRenderConnectionLabel(label: string, style?: "solid" | "dashed") {
  if (style === "dashed") {
    return true;
  }

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

function routeArrow(from: Box, to: Box, index: number): { startX: number; startY: number; points: Array<[number, number]> } {
  const sameRow = Math.abs(from.y - to.y) < Math.max(from.height, to.height) * 0.6;
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

  const interZoneGap = Math.abs(dy);
  const verticalGap = Math.max(28, Math.min(56, interZoneGap / 2));
  const laneY = startY + verticalGap;
  const sideStep = index % 2 === 0 ? -18 : 18;

  return {
    startX,
    startY,
    points: [
      [0, 0],
      [0, laneY - startY],
      [dx + sideStep, laneY - startY],
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
): { x: number; y: number } {
  const endPoint = points[points.length - 1] ?? [0, 0];
  const endX = startX + endPoint[0];
  const endY = startY + endPoint[1];
  const labelWidth = Math.min(labelText.length * 7, 140);

  if (points.length === 2) {
    const midX = startX + endPoint[0] / 2;
    const midY = startY + endPoint[1] / 2;
    const isHorizontal = Math.abs(endPoint[1]) < Math.abs(endPoint[0]) * 0.3;
    return isHorizontal
      ? { x: midX - labelWidth / 2, y: midY - 20 }
      : { x: midX + LABEL_CLEARANCE, y: midY + getLabelOffset(index) };
  }

  const midPoint = points[1] ?? [0, 0];
  const laneY = startY + midPoint[1];
  const midX = (startX + endX) / 2;
  return {
    x: midX - labelWidth / 2,
    y: laneY + (endY > startY ? -LABEL_CLEARANCE - 2 : LABEL_CLEARANCE + 2),
  };
}

export function layoutArchitecture(architecture: ArchitectureModel): {
  layout: DiagramLayout;
  elements: DiagramSeed[];
} {
  const elements: DiagramSeed[] = [];
  const componentBoxes = new Map<string, Box>();
  const zoneOrder = sortZones(architecture);
  let currentY = CANVAS_PADDING;
  let maxWidth = 0;

  const zoneDimensions = new Map<
    string,
    {
      title: ReturnType<typeof getTitleSize>;
      rows: ArchitectureComponent[][];
      rowHeights: number[];
      contentWidth: number;
      width: number;
      height: number;
    }
  >();

  for (const zone of zoneOrder) {
    const components = sortComponents(architecture, zone.id);
    const rows = getRows(components);
    const widestRowWidth = Math.max(...rows.map((row) => getRowWidth(row, architecture)), MIN_COMPONENT_WIDTH);
    const title = getTitleSize(zone.label);
    const rowHeights = rows.map((row) =>
      row.reduce(
        (height, component) => Math.max(height, getComponentSize(component.label, architecture).height),
        MIN_COMPONENT_HEIGHT,
      ),
    );
    const width = Math.max(ZONE_PADDING_X * 2 + widestRowWidth, ZONE_PADDING_X * 2 + title.width);
    const height =
      title.height +
      ZONE_PADDING_Y * 2 +
      rowHeights.reduce((sum, rowHeight) => sum + rowHeight, 0) +
      Math.max(0, rowHeights.length - 1) * COMPONENT_GAP_Y;

    zoneDimensions.set(zone.id, {
      title,
      rows,
      rowHeights,
      contentWidth: widestRowWidth,
      width,
      height,
    });
  }

  const unifiedZoneWidth = Math.max(
    ...Array.from(zoneDimensions.values()).map((zone) => zone.width),
    1200 - CANVAS_PADDING * 2,
  );

  zoneOrder.forEach((zone) => {
    const zoneDimension = zoneDimensions.get(zone.id);
    if (!zoneDimension) {
      return;
    }
    const { title, rows, rowHeights, height: zoneHeight } = zoneDimension;
    const zoneTitleHeight = title.height;
    const zoneWidth = unifiedZoneWidth;
    const zoneX = CANVAS_PADDING;
    const zoneY = currentY;

    elements.push({
      id: `${zone.id}-container`,
      type: "rectangle",
      x: zoneX,
      y: zoneY,
      width: zoneWidth,
      height: zoneHeight,
      strokeColor: "#3f3f46",
      backgroundColor: zoneColor(zone.type),
      fillStyle: "solid",
      roughness: 1,
    });
    elements.push({
      id: `${zone.id}-title`,
      type: "text",
      x: zoneX + 16,
      y: zoneY + 10,
      text: title.lines.join("\n"),
      fontSize: 22,
      strokeColor: "#18181b",
    });

    let runningY = zoneY + zoneTitleHeight + ZONE_PADDING_Y;
      rows.forEach((row, rowIndex) => {
      const rowWidth = getRowWidth(row, architecture);
      let componentX = zoneX + (zoneWidth - rowWidth) / 2;
      const componentY = runningY;

      row.forEach((component) => {
        const size = getComponentSize(component.label, architecture);
        elements.push({
          id: `${component.id}-box`,
          type: "rectangle",
          x: componentX,
          y: componentY,
          width: size.width,
          height: size.height,
          strokeColor: "#27272a",
          backgroundColor: componentColor(component, architecture),
          fillStyle: "solid",
          roughness: 1,
        });
        elements.push({
          id: `${component.id}-label`,
          type: "text",
          x: componentX + 18,
          y: componentY + 18,
          text: size.lines.join("\n"),
          fontSize: 18,
          strokeColor: "#18181b",
          containerId: `${component.id}-box`,
        });
        componentBoxes.set(component.id, {
          x: componentX,
          y: componentY,
          width: size.width,
          height: size.height,
        });
        componentX += size.width + COMPONENT_GAP_X;
      });

      runningY += rowHeights[rowIndex] + COMPONENT_GAP_Y;
    });

    currentY += zoneHeight + ZONE_GAP;
    maxWidth = Math.max(maxWidth, zoneWidth + CANVAS_PADDING * 2);
  });

  architecture.connections.forEach((connection, index) => {
    const from = componentBoxes.get(connection.from);
    const to = componentBoxes.get(connection.to);
    if (!from || !to) {
      return;
    }
    const { startX, startY, points } = routeArrow(from, to, index);

    elements.push({
      id: connection.id,
      type: "arrow",
      x: startX,
      y: startY,
      points,
      strokeColor: "#27272a",
      strokeStyle: connection.style === "dashed" ? "dashed" : "solid",
      roughness: 1,
    });

    if (connection.label && shouldRenderConnectionLabel(connection.label, connection.style)) {
      const labelText = shortenLabel(connection.label);
      const { x: labelX, y: labelY } = arrowLabelPosition(startX, startY, points, index, labelText);
      elements.push({
        id: `${connection.id}-label`,
        type: "text",
        x: labelX,
        y: labelY,
        text: labelText,
        fontSize: 16,
        strokeColor: "#3f3f46",
      });
    }
  });

  return {
    layout: {
      width: Math.max(maxWidth, 1200),
      height: Math.max(currentY, 900),
    },
    elements,
  };
}

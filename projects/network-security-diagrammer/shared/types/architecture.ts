export type ZoneType =
  | "external"
  | "dmz"
  | "security-zone"
  | "internal"
  | "cloud"
  | "branch"
  | "data-center";

export type ComponentType =
  | "user"
  | "network"
  | "security-control"
  | "identity"
  | "application"
  | "data"
  | "monitoring"
  | "integration";

export interface ArchitectureZone {
  id: string;
  label: string;
  type: ZoneType;
  row?: number;          // zones sharing the same row value render side-by-side
  order?: number;        // explicit vertical sort position — overrides ZONE_TYPE_ORDER when set
  sortPriority?: number; // tie-break within the same order/type bucket; higher = renders later (lower on canvas)
}

export interface ArchitectureComponent {
  id: string;
  label: string;
  type: ComponentType;
  zoneId: string;
  importance?: "normal" | "critical";
  displayOrder?: number;
}

export interface ArchitectureConnection {
  id: string;
  from: string;
  to: string;
  label?: string;
  style?: "solid" | "dashed";
}

export interface ArchitectureModel {
  title: string;
  summary: string;
  assumptions: string[];
  appliedChanges: string[];
  securityRationale?: string[];
  zones: ArchitectureZone[];
  components: ArchitectureComponent[];
  connections: ArchitectureConnection[];
}

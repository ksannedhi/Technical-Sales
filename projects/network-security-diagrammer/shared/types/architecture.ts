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
}

export interface ArchitectureComponent {
  id: string;
  label: string;
  type: ComponentType;
  zoneId: string;
  importance?: "normal" | "critical";
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
  zones: ArchitectureZone[];
  components: ArchitectureComponent[];
  connections: ArchitectureConnection[];
}

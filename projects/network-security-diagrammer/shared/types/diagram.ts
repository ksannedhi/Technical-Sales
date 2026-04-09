export type DiagramSeedType = "rectangle" | "text" | "arrow";

export interface DiagramSeed {
  id: string;
  type: DiagramSeedType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
  containerId?: string;
  points?: Array<[number, number]>;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: "solid" | "hachure";
  strokeStyle?: "solid" | "dashed";
  roughness?: 0 | 1 | 2;
  fontSize?: number;
  angle?: number;
  labelText?: string;
}

export interface DiagramLayout {
  width: number;
  height: number;
}

export interface DiagramResponse {
  analysis: import("./analysis.js").PromptAnalysis;
  architecture: import("./architecture.js").ArchitectureModel;
  layout: DiagramLayout;
  elements: DiagramSeed[];
}

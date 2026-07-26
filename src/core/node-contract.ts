export interface CapabilityReport {
  os: string;
  arch: string;
  display: "x11" | "wayland" | "none";
  tools: string[];
  screen: boolean;
  input: "xdotool" | "ydotool" | "none";
  gpu?: boolean;
}

export interface PortSchema {
  name: string;
  type: "item" | "artifact";
}

export interface ArtifactRef {
  $artifact: string;
  mime: string;
  size: number;
  name: string;
}

export interface NodeItem {
  json: Record<string, unknown>;
  binary?: Record<string, ArtifactRef>;
}

export interface SimulationReport {
  description: string;
  wouldDo: string;
  data?: NodeItem[];
}

export interface ArtifactStoreHandle {
  store(data: ArrayBuffer | Uint8Array, mime: string, name: string, ttlHours?: number): Promise<ArtifactRef>;
}

export interface RunContext<P = unknown> {
  nodeId: string;
  nodeName: string;
  params: P;
  items: NodeItem[];
  env: Record<string, string>;
  secrets: Record<string, string>;
  state: {
    get(key: string): unknown;
    set(key: string, value: void): void;
  };
  now: Date;
  agentId: string;
  runId: string;
  dryRun: boolean;
  artifacts?: ArtifactStoreHandle;
}

export interface NodeDefinition<P = unknown> {
  type: string;
  version: number;
  displayName: string;
  category: string;
  icon?: string;
  requiredCapabilities?: Partial<CapabilityReport>;
  sideEffecting: boolean;
  inputs: PortSchema[];
  outputs: PortSchema[];
  paramsSchema: Record<string, unknown>;
  run(ctx: RunContext<P>): Promise<NodeItem[]>;
  simulate?(ctx: RunContext<P>): Promise<SimulationReport>;
}

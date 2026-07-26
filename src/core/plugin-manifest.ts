export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  author?: string;
  main: string;
  permissions: {
    fs?: boolean;
    net?: boolean;
    env?: boolean;
  };
  nodes: PluginNodeManifest[];
}

export interface PluginNodeManifest {
  type: string;
  version: number;
  displayName: string;
  category: string;
  icon?: string;
  sideEffecting: boolean;
  inputs: { name: string; type: "item" | "artifact" }[];
  outputs: { name: string; type: "item" | "artifact" }[];
  paramsSchema: Record<string, unknown>;
  requiredCapabilities?: Record<string, unknown>;
}

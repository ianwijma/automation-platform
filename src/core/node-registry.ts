import type { NodeDefinition, CapabilityReport } from "../core/node-contract.js";

class NodeRegistry {
  private nodes = new Map<string, NodeDefinition>();

  register(definition: NodeDefinition): void {
    const key = `${definition.type}@${definition.version}`;
    if (this.nodes.has(key)) {
      throw new Error(`Node already registered: ${key}`);
    }
    this.nodes.set(key, definition);
  }

  lookup(type: string, version?: number): NodeDefinition | undefined {
    if (version !== undefined) {
      return this.nodes.get(`${type}@${version}`);
    }
    let latest: NodeDefinition | undefined;
    for (const [key, def] of this.nodes) {
      if (def.type === type) {
        if (!latest || def.version > latest.version) {
          latest = def;
        }
      }
    }
    return latest;
  }

  all(): NodeDefinition[] {
    return [...this.nodes.values()];
  }

  byCategory(): Record<string, NodeDefinition[]> {
    const result: Record<string, NodeDefinition[]> = {};
    for (const def of this.nodes.values()) {
      const cat = def.category;
      if (!result[cat]) result[cat] = [];
      result[cat].push(def);
    }
    return result;
  }
}

const globalRegistry = new NodeRegistry();

export { globalRegistry as nodeRegistry, NodeRegistry };

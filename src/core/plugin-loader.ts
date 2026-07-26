import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { PluginManifest } from "./plugin-manifest.js";
import type { NodeDefinition, RunContext, NodeItem, SimulationReport } from "./node-contract.js";
import { nodeRegistry } from "./node-registry.js";

interface LoadedPlugin {
  manifest: PluginManifest;
  dir: string;
  nodeDefs: NodeDefinition[];
}

export class PluginLoader {
  private loaded: LoadedPlugin[] = [];

  async loadFromDir(pluginsDir: string): Promise<void> {
    if (!existsSync(pluginsDir)) return;

    const entries = readdirSync(pluginsDir).sort();
    for (const entry of entries) {
      const fullPath = join(pluginsDir, entry);
      if (!statSync(fullPath).isDirectory()) continue;

      const manifestPath = join(fullPath, "ap-plugin.json");
      if (!existsSync(manifestPath)) continue;

      try {
        const plugin = await this.loadPlugin(fullPath);
        this.loaded.push(plugin);
      } catch (err) {
        console.error(`Failed to load plugin from ${fullPath}: ${(err as Error).message}`);
      }
    }
  }

  async loadPlugin(dir: string): Promise<LoadedPlugin> {
    const manifestPath = join(dir, "ap-plugin.json");
    const raw = readFileSync(manifestPath, "utf-8");
    const manifest: PluginManifest = JSON.parse(raw);

    if (!manifest.name || !manifest.version || !manifest.main) {
      throw new Error("Plugin manifest must have name, version, and main fields");
    }

    if (!manifest.nodes || manifest.nodes.length === 0) {
      throw new Error("Plugin manifest must declare at least one node");
    }

    const entryPath = resolve(dir, manifest.main);
    if (!existsSync(entryPath)) {
      throw new Error(`Plugin entry point not found: ${entryPath}`);
    }

    const nodeDefs = await this.loadNodesFromPlugin(dir, manifest, entryPath);

    const plugin: LoadedPlugin = { manifest, dir, nodeDefs };
    if (!this.loaded.find((p) => p.manifest.name === manifest.name)) {
      this.loaded.push(plugin);
    }

    return plugin;
  }

  private async loadNodesFromPlugin(
    dir: string,
    manifest: PluginManifest,
    entryPath: string,
  ): Promise<NodeDefinition[]> {
    const nodeDefs: NodeDefinition[] = [];

    const module = await import(entryPath);

    const nodeExports = module.nodes ?? module.default?.nodes ?? module;

    for (const nodeManifest of manifest.nodes) {
      const runFn = nodeExports[nodeManifest.type];
      if (!runFn || typeof runFn !== "function") {
        throw new Error(
          `Plugin ${manifest.name} did not export function for node type: ${nodeManifest.type}. ` +
          `Export a \`nodes\` map keyed by node type, e.g. export { nodes: { "${nodeManifest.type}": async (ctx) => {...} } }`,
        );
      }

      const simulateFn = nodeExports[`${nodeManifest.type}:simulate`];

      const def: NodeDefinition = {
        type: nodeManifest.type,
        version: nodeManifest.version,
        displayName: nodeManifest.displayName,
        category: nodeManifest.category,
        icon: nodeManifest.icon,
        sideEffecting: nodeManifest.sideEffecting,
        inputs: nodeManifest.inputs,
        outputs: nodeManifest.outputs,
        paramsSchema: nodeManifest.paramsSchema,
        requiredCapabilities: nodeManifest.requiredCapabilities as NodeDefinition["requiredCapabilities"],
        run: wrapPluginRun(manifest, runFn),
        ...(simulateFn && typeof simulateFn === "function"
          ? { simulate: wrapPluginSimulate(manifest, simulateFn) }
          : {}),
      };

      nodeDefs.push(def);
      nodeRegistry.register(def);
    }

    return nodeDefs;
  }

  getLoaded(): LoadedPlugin[] {
    return [...this.loaded];
  }

  getPluginNames(): string[] {
    return this.loaded.map((p) => p.manifest.name);
  }
}

function wrapPluginRun(
  manifest: PluginManifest,
  fn: (ctx: RunContext) => Promise<NodeItem[]>,
): (ctx: RunContext) => Promise<NodeItem[]> {
  return async (ctx) => {
    try {
      return await fn(ctx);
    } catch (err) {
      throw new Error(`Plugin ${manifest.name} node error: ${(err as Error).message}`);
    }
  };
}

function wrapPluginSimulate(
  manifest: PluginManifest,
  fn: (ctx: RunContext) => Promise<SimulationReport>,
): (ctx: RunContext) => Promise<SimulationReport> {
  return async (ctx) => {
    try {
      return await fn(ctx);
    } catch (err) {
      throw new Error(`Plugin ${manifest.name} simulate error: ${(err as Error).message}`);
    }
  };
}

export async function loadPlugins(pluginsDir?: string): Promise<PluginLoader> {
  const loader = new PluginLoader();
  if (pluginsDir) {
    await loader.loadFromDir(pluginsDir);
  }
  return loader;
}

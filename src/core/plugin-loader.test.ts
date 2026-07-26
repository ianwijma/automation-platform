import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { PluginLoader, loadPlugins } from "./plugin-loader.js";

const TMP_DIR = join("/tmp", "ap-plugin-test", String(Date.now()));

const VALID_PLUGIN_MANIFEST = {
  name: "test-plugin",
  version: "1.0.0",
  description: "A test plugin",
  main: "index.js",
  permissions: { fs: false, net: false, env: false },
  nodes: [
    {
      type: "test.greet",
      version: 1,
      displayName: "Greet",
      category: "execution",
      sideEffecting: false,
      inputs: [{ name: "in", type: "item" }],
      outputs: [{ name: "out", type: "item" }],
      paramsSchema: {
        type: "object",
        properties: {
          name: { type: "string", default: "World" },
        },
      },
    },
  ],
};

const VALID_PLUGIN_ENTRY = `
export const nodes = {
  "test.greet": async (ctx) => {
    const name = ctx.params?.name || 'World';
    return [{ json: { greeting: 'Hello, ' + name + '!' } }];
  },
  "test.greet:simulate": async (ctx) => {
    return { description: 'Greet simulation', wouldDo: 'Would greet ' + (ctx.params?.name || 'World') };
  },
};
`;

describe("PluginLoader", () => {
  beforeAll(() => {
    mkdirSync(TMP_DIR, { recursive: true });
  });

  afterAll(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  test("skips non-existent directory", async () => {
    const loader = new PluginLoader();
    await loader.loadFromDir(join(TMP_DIR, "nonexistent"));
    expect(loader.getLoaded()).toHaveLength(0);
  });

  test("skips directories without manifest", async () => {
    const noManifestDir = join(TMP_DIR, "no-manifest");
    mkdirSync(noManifestDir, { recursive: true });
    const loader = new PluginLoader();
    await loader.loadFromDir(TMP_DIR);
    expect(loader.getLoaded()).toHaveLength(0);
  });

  test("rejects manifest missing required fields", async () => {
    const badDir = join(TMP_DIR, "bad-plugin");
    mkdirSync(badDir, { recursive: true });
    writeFileSync(join(badDir, "ap-plugin.json"), JSON.stringify({ name: "bad" }));
    const loader = new PluginLoader();
    await expect(loader.loadPlugin(badDir)).rejects.toThrow("must have name, version, and main");
  });

  test("rejects manifest with no nodes", async () => {
    const noNodesDir = join(TMP_DIR, "no-nodes-plugin");
    mkdirSync(noNodesDir, { recursive: true });
    writeFileSync(
      join(noNodesDir, "ap-plugin.json"),
      JSON.stringify({ name: "no-nodes", version: "1.0.0", main: "index.js", nodes: [] }),
    );
    const loader = new PluginLoader();
    await expect(loader.loadPlugin(noNodesDir)).rejects.toThrow("at least one node");
  });

  test("rejects manifest with missing entry point", async () => {
    const missingEntryDir = join(TMP_DIR, "missing-entry-plugin");
    mkdirSync(missingEntryDir, { recursive: true });
    writeFileSync(
      join(missingEntryDir, "ap-plugin.json"),
      JSON.stringify(VALID_PLUGIN_MANIFEST),
    );
    const loader = new PluginLoader();
    await expect(loader.loadPlugin(missingEntryDir)).rejects.toThrow("entry point not found");
  });

  test("loadPlugins helper returns empty loader without dir", async () => {
    const loader = await loadPlugins();
    expect(loader.getLoaded()).toHaveLength(0);
  });
});

describe("PluginLoader — full load", () => {
  const fullDir = join("/tmp", "ap-plugin-full-test", String(Date.now()));

  beforeAll(() => {
    mkdirSync(fullDir, { recursive: true });
  });

  afterAll(() => {
    rmSync(fullDir, { recursive: true, force: true });
  });

  test("loads plugin with valid entry point and registers nodes", async () => {
    const pluginDir = join(fullDir, "my-plugin");
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(join(pluginDir, "ap-plugin.json"), JSON.stringify(VALID_PLUGIN_MANIFEST));
    writeFileSync(join(pluginDir, "index.js"), VALID_PLUGIN_ENTRY);

    const loader = new PluginLoader();
    const plugin = await loader.loadPlugin(pluginDir);

    expect(plugin.manifest.name).toBe("test-plugin");
    expect(plugin.nodeDefs).toHaveLength(1);
    expect(plugin.nodeDefs[0].type).toBe("test.greet");
    expect(plugin.nodeDefs[0].sideEffecting).toBe(false);
    expect(loader.getPluginNames()).toContain("test-plugin");
  });

  test("loaded node run function works", async () => {
    const pluginDir = join(fullDir, "run-test-plugin");
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(join(pluginDir, "ap-plugin.json"), JSON.stringify({
      ...VALID_PLUGIN_MANIFEST,
      name: "run-test",
      nodes: [{
        ...VALID_PLUGIN_MANIFEST.nodes[0],
        type: "test.runcheck",
      }],
    }));
    const runEntry = `
export const nodes = {
  "test.runcheck": async (ctx) => {
    const name = ctx.params?.name || 'World';
    return [{ json: { greeting: 'Hello, ' + name + '!' } }];
  },
  "test.runcheck:simulate": async (ctx) => {
    return { description: 'Sim', wouldDo: 'Would greet ' + (ctx.params?.name || 'World') };
  },
};
`;
    writeFileSync(join(pluginDir, "index.js"), runEntry);

    const loader = new PluginLoader();
    const plugin = await loader.loadPlugin(pluginDir);
    const nodeDef = plugin.nodeDefs[0];

    const result = await nodeDef.run({
      nodeId: "n1",
      nodeName: "Test",
      params: { name: "Plugin" },
      items: [],
      env: {},
      secrets: {},
      state: { get: () => undefined, set: () => {} },
      now: new Date(),
      agentId: "local",
      runId: "r1",
      dryRun: false,
    });

    expect(result).toHaveLength(1);
    expect(result[0].json.greeting).toBe("Hello, Plugin!");
  });

  test("loaded node simulate function works", async () => {
    const pluginDir = join(fullDir, "sim-test-plugin");
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(join(pluginDir, "ap-plugin.json"), JSON.stringify({
      ...VALID_PLUGIN_MANIFEST,
      name: "sim-test",
      nodes: [{
        ...VALID_PLUGIN_MANIFEST.nodes[0],
        type: "test.simcheck",
      }],
    }));
    const simEntry = `
export const nodes = {
  "test.simcheck": async (ctx) => {
    return [{ json: { ok: true } }];
  },
  "test.simcheck:simulate": async (ctx) => {
    return { description: 'Greet simulation', wouldDo: 'Would greet ' + (ctx.params?.name || 'World') };
  },
};
`;
    writeFileSync(join(pluginDir, "index.js"), simEntry);

    const loader = new PluginLoader();
    const plugin = await loader.loadPlugin(pluginDir);
    const nodeDef = plugin.nodeDefs[0];

    const result = await nodeDef.simulate!({
      nodeId: "n1",
      nodeName: "Test",
      params: { name: "Plugin" },
      items: [],
      env: {},
      secrets: {},
      state: { get: () => undefined, set: () => {} },
      now: new Date(),
      agentId: "local",
      runId: "r1",
      dryRun: true,
    });

    expect(result.description).toBe("Greet simulation");
    expect(result.wouldDo).toContain("Plugin");
  });
});

describe("PluginManifest schema", () => {
  test("valid manifest has expected shape", () => {
    const manifest = VALID_PLUGIN_MANIFEST;
    expect(manifest.name).toBe("test-plugin");
    expect(manifest.permissions.fs).toBe(false);
    expect(manifest.nodes).toHaveLength(1);
    expect(manifest.nodes[0].type).toBe("test.greet");
  });
});

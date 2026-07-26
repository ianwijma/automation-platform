import { describe, test, expect, beforeEach } from "bun:test";
import { AgentDispatcher } from "./dispatcher.js";
import type { AgentDispatch, RunRecord, NodeExecutionRecord } from "../core/execution-engine.js";

function makeRun(id: string): RunRecord {
  return {
    id,
    automationId: "auto-1",
    versionId: "v-1",
    mode: "manual",
    status: "success",
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    error: null,
    nodeExecutions: [],
  };
}

function makeNodeExec(id: string, runId: string): NodeExecutionRecord {
  return {
    id,
    runId,
    nodeId: "node-1",
    agentId: "local",
    status: "success",
    attempt: 0,
    simulated: false,
    input: null,
    output: null,
    pinned: false,
    startedAt: new Date().toISOString(),
    durationMs: 100,
    error: null,
  };
}

describe("AgentDispatcher", () => {
  let dispatcher: AgentDispatcher;

  beforeEach(() => {
    dispatcher = new AgentDispatcher();
  });

  test("registers local agent on construction", () => {
    const agent = dispatcher.getAgentForTarget({ kind: "local" });
    expect(agent.agentId).toBe("local");
  });

  test("registerAgent adds agent to registry", () => {
    const fakeAgent: AgentDispatch = {
      agentId: "remote-1",
      send: (() => {}) as any,
    };
    dispatcher.registerAgent(fakeAgent);
    const got = dispatcher.getAgentForTarget({ kind: "tag", value: "remote-1" });
    expect(got.agentId).toBe("local");
  });

  test("saveRun and getRun", () => {
    const run = makeRun("run-1");
    dispatcher.saveRun(run);
    expect(dispatcher.getRun("run-1")).toEqual(run);
  });

  test("saveRun updates existing run", () => {
    const run = makeRun("run-1");
    dispatcher.saveRun(run);
    const updated = { ...run, status: "error" as const, error: "fail" };
    dispatcher.saveRun(updated);
    expect(dispatcher.getRun("run-1")!.status).toBe("error");
    expect(dispatcher.getRun("run-1")!.error).toBe("fail");
  });

  test("getRun returns undefined for non-existent", () => {
    expect(dispatcher.getRun("nope")).toBeUndefined();
  });

  test("getAllRuns returns all saved runs", () => {
    dispatcher.saveRun(makeRun("r1"));
    dispatcher.saveRun(makeRun("r2"));
    const all = dispatcher.getAllRuns();
    expect(all.length).toBe(2);
  });

  test("saveNodeExecution stores record", () => {
    const rec = makeNodeExec("ne-1", "run-1");
    dispatcher.saveNodeExecution(rec);
    expect(dispatcher.getAllRuns()).toHaveLength(0);
  });

  test("updateNodeExecution patches existing record", () => {
    const rec = makeNodeExec("ne-1", "run-1");
    dispatcher.saveNodeExecution(rec);
    dispatcher.updateNodeExecution("ne-1", { status: "error", error: "boom" });
    expect(dispatcher.getRun("run-1")).toBeUndefined();
  });

  describe("getAgentForTarget", () => {
    test("returns local agent for local target", () => {
      const agent = dispatcher.getAgentForTarget({ kind: "local" });
      expect(agent.agentId).toBe("local");
    });

    test("returns local agent for machine target with value 'local'", () => {
      const agent = dispatcher.getAgentForTarget({ kind: "machine", value: "local" });
      expect(agent.agentId).toBe("local");
    });

    test("returns local agent for machine target matching local agentId", () => {
      const local = dispatcher.getAgentForTarget({ kind: "local" });
      const agent = dispatcher.getAgentForTarget({ kind: "machine", value: local.agentId });
      expect(agent.agentId).toBe("local");
    });

    test("throws for unknown machine target", () => {
      expect(() =>
        dispatcher.getAgentForTarget({ kind: "machine", value: "remote-x" })
      ).toThrow(/Remote agents not yet supported/);
    });

    test("returns local for tag target", () => {
      const agent = dispatcher.getAgentForTarget({ kind: "tag", value: "prod" });
      expect(agent.agentId).toBe("local");
    });

    test("returns local for any target", () => {
      const agent = dispatcher.getAgentForTarget({ kind: "any" });
      expect(agent.agentId).toBe("local");
    });

    test("throws for unknown target kind", () => {
      expect(() =>
        dispatcher.getAgentForTarget({ kind: "unknown" as any })
      ).toThrow(/Unknown target kind/);
    });
  });

  describe("resolveEnv", () => {
    test("returns empty object when no envResolver", () => {
      expect(dispatcher.resolveEnv("local", "auto-1", "trigger.manual")).toEqual({});
    });

    test("delegates to envResolver when set", () => {
      const mockResolver = {
        resolveForExecution: () => ({ FOO: "bar" }),
      } as any;
      dispatcher.setEnvResolver(mockResolver);
      expect(dispatcher.resolveEnv("local", "auto-1", "trigger.manual")).toEqual({ FOO: "bar" });
    });
  });

  describe("resolveSecrets", () => {
    test("returns empty object when no vault", () => {
      expect(dispatcher.resolveSecrets("local", {})).toEqual({});
    });

    test("resolves credential refs via vault", () => {
      const mockVault = {
        getCredentialByName: () => ({ id: "c1", name: "test", type: "api_key", values: { key: "secret123" } }),
      } as any;
      dispatcher.setVault(mockVault);
      const result = dispatcher.resolveSecrets("local", { type: "api_key", name: "test" });
      expect(result.key).toBe("secret123");
    });

    test("returns empty when credential refs missing type/name", () => {
      const mockVault = {
        getCredentialByName: () => null,
      } as any;
      dispatcher.setVault(mockVault);
      expect(dispatcher.resolveSecrets("local", {})).toEqual({});
    });

    test("returns empty when vault throws", () => {
      const mockVault = {
        getCredentialByName: () => {
          throw new Error("not found");
        },
      } as any;
      dispatcher.setVault(mockVault);
      const result = dispatcher.resolveSecrets("local", { type: "api_key", name: "missing" });
      expect(result).toEqual({});
    });
  });

  describe("state", () => {
    test("getState returns undefined for unset key", () => {
      expect(dispatcher.getState("auto-1", "key")).toBeUndefined();
    });

    test("setState and getState round-trip", () => {
      dispatcher.setState("auto-1", "key", { val: 42 });
      expect(dispatcher.getState("auto-1", "key")).toEqual({ val: 42 });
    });

    test("state is scoped by automationId", () => {
      dispatcher.setState("auto-1", "key", "a");
      dispatcher.setState("auto-2", "key", "b");
      expect(dispatcher.getState("auto-1", "key")).toBe("a");
      expect(dispatcher.getState("auto-2", "key")).toBe("b");
    });
  });
});

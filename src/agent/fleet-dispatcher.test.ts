import { describe, test, expect, beforeEach } from "bun:test";
import { FleetDispatcher } from "./fleet-dispatcher.js";
import { LocalAgent } from "./local-agent.js";
import type { AgentDispatch } from "../core/execution-engine.js";
import type { CapabilityReport } from "../core/node-contract.js";

const LINUX_CAPS: CapabilityReport = {
  os: "linux",
  arch: "x64",
  display: "x11",
  tools: ["xdotool", "maim"],
  screen: true,
  input: "xdotool",
  gpu: true,
};

const MAC_CAPS: CapabilityReport = {
  os: "darwin",
  arch: "arm64",
  display: "none",
  tools: [],
  screen: false,
  input: "none",
  gpu: undefined,
};

const HEADLESS_CAPS: CapabilityReport = {
  os: "linux",
  arch: "x64",
  display: "none",
  tools: [],
  screen: false,
  input: "none",
  gpu: undefined,
};

class MockRemoteAgent implements AgentDispatch {
  agentId: string;
  private callLog: Array<{ nodeExecId: string; nodeType: string }> = [];
  private mockResult: { items: any[]; durationMs: number; error?: string };

  constructor(agentId: string, mockResult?: { items: any[]; durationMs: number }) {
    this.agentId = agentId;
    this.mockResult = mockResult ?? { items: [{ json: { result: "remote-ok" } }], durationMs: 100 };
  }

  async send(
    nodeExecId: string,
    _node: any,
    _params: any,
    _items: any,
    _secrets: any,
    _env: any,
    _dryRun: boolean,
    _timeoutSec: number,
    _state: any,
    _runId: string,
    _automationId: string,
  ): Promise<{ items: any[]; durationMs: number; error?: string }> {
    this.callLog.push({ nodeExecId, nodeType: _node.type });
    return this.mockResult;
  }

  getCalls() {
    return [...this.callLog];
  }
}

function registerMock(dispatcher: FleetDispatcher, agentId: string, name: string, caps: CapabilityReport, tags: string[] = []) {
  const mockAgent = new MockRemoteAgent(agentId);
  dispatcher.registerFleetAgent(mockAgent, name, caps, tags);
  return mockAgent;
}

describe("FleetDispatcher", () => {
  let dispatcher: FleetDispatcher;

  beforeEach(() => {
    dispatcher = new FleetDispatcher();
  });

  test("local agent is registered on startup", () => {
    const local = dispatcher.getAgentForTarget({ kind: "local" });
    expect(local.agentId).toBe("local");
  });

  test("local dispatch works", async () => {
    const local = dispatcher.getAgentForTarget({ kind: "local" });
    expect(local).toBeInstanceOf(LocalAgent);
  });

  test("machine target with local value returns local agent", () => {
    const agent = dispatcher.getAgentForTarget({ kind: "machine", value: "local" });
    expect(agent.agentId).toBe("local");
  });

  test("remote agent registration and dispatch routing", () => {
    registerMock(dispatcher, "agent-1", "worker-1", LINUX_CAPS, ["worker", "linux"]);

    const agent = dispatcher.getAgentForTarget({ kind: "machine", value: "agent-1" });
    expect(agent.agentId).toBe("agent-1");
  });

  test("target resolution: machine by name", () => {
    registerMock(dispatcher, "agent-2", "builder-node", LINUX_CAPS);

    const agent = dispatcher.getAgentForTarget({ kind: "machine", value: "builder-node" });
    expect(agent.agentId).toBe("agent-2");
  });

  test("target resolution: tag matching", () => {
    registerMock(dispatcher, "agent-a", "worker-a", LINUX_CAPS, ["worker"]);
    registerMock(dispatcher, "agent-b", "worker-b", MAC_CAPS, ["worker", "mac"]);

    const agent = dispatcher.getAgentForTarget({ kind: "tag", value: "mac" });
    expect(agent.agentId).toBe("agent-b");
  });

  test("target resolution: any picks least-busy agent", () => {
    registerMock(dispatcher, "agent-a", "worker-a", LINUX_CAPS);
    registerMock(dispatcher, "agent-b", "worker-b", LINUX_CAPS);

    dispatcher.incrementPending("agent-a");
    dispatcher.incrementPending("agent-a");
    dispatcher.incrementPending("agent-b");

    const agent = dispatcher.getAgentForTarget({ kind: "any" });
    expect(agent.agentId).toBe("agent-b");
  });

  test("target resolution: tag with no match throws", () => {
    registerMock(dispatcher, "agent-1", "worker", LINUX_CAPS, ["worker"]);

    expect(() => {
      dispatcher.getAgentForTarget({ kind: "tag", value: "gpu" });
    }).toThrow(/No online agent with tag "gpu"/);
  });

  test("target resolution: any with no online agents throws", () => {
    dispatcher.markAgentOffline("local");

    expect(() => {
      dispatcher.getAgentForTarget({ kind: "any" });
    }).toThrow(/No online agent/);
  });

  test("capability filtering: node requires screen, agent has it", () => {
    registerMock(dispatcher, "agent-screen", "screen-worker", LINUX_CAPS);

    const agent = dispatcher.getAgentForTarget(
      { kind: "machine", value: "agent-screen" },
      { screen: true },
    );
    expect(agent.agentId).toBe("agent-screen");
  });

  test("capability filtering: node requires screen, agent doesn't have it → error", () => {
    registerMock(dispatcher, "agent-headless", "headless-worker", HEADLESS_CAPS);

    expect(() => {
      dispatcher.getAgentForTarget(
        { kind: "machine", value: "agent-headless" },
        { screen: true },
      );
    }).toThrow(/lacks required capabilities/);
  });

  test("capability filtering: tag with required capabilities", () => {
    registerMock(dispatcher, "agent-a", "worker-a", HEADLESS_CAPS, ["worker"]);
    registerMock(dispatcher, "agent-b", "worker-b", LINUX_CAPS, ["worker"]);

    const agent = dispatcher.getAgentForTarget(
      { kind: "tag", value: "worker" },
      { screen: true },
    );
    expect(agent.agentId).toBe("agent-b");
  });

  test("capability filtering: tools requirement", () => {
    registerMock(dispatcher, "agent-a", "worker-a", HEADLESS_CAPS, ["worker"]);
    registerMock(dispatcher, "agent-b", "worker-b", LINUX_CAPS, ["worker"]);

    const agent = dispatcher.getAgentForTarget(
      { kind: "tag", value: "worker" },
      { tools: ["xdotool"] },
    );
    expect(agent.agentId).toBe("agent-b");
  });

  test("offline agent → fail loudly", () => {
    registerMock(dispatcher, "agent-off", "offline-worker", LINUX_CAPS);
    dispatcher.markAgentOffline("agent-off");

    expect(() => {
      dispatcher.getAgentForTarget({ kind: "machine", value: "agent-off" });
    }).toThrow(/offline/);
  });

  test("unknown machine target throws descriptive error", () => {
    expect(() => {
      dispatcher.getAgentForTarget({ kind: "machine", value: "nonexistent" });
    }).toThrow(/No agent found/);
  });

  test("unknown target kind throws", () => {
    expect(() => {
      dispatcher.getAgentForTarget({ kind: "galaxy" });
    }).toThrow(/Unknown target kind/);
  });

  test("tag without value throws", () => {
    expect(() => {
      dispatcher.getAgentForTarget({ kind: "tag" });
    }).toThrow(/requires a value/);
  });

  test("busyness tracking: prefer less busy agent", () => {
    registerMock(dispatcher, "busy-agent", "busy", LINUX_CAPS, ["worker"]);
    registerMock(dispatcher, "idle-agent", "idle", LINUX_CAPS, ["worker"]);

    for (let i = 0; i < 5; i++) dispatcher.incrementPending("busy-agent");
    dispatcher.incrementPending("idle-agent");

    const agent = dispatcher.getAgentForTarget({ kind: "tag", value: "worker" });
    expect(agent.agentId).toBe("idle-agent");
  });

  test("pending count decrement works", () => {
    dispatcher.incrementPending("local");
    dispatcher.incrementPending("local");
    dispatcher.decrementPending("local");

    expect(dispatcher.getFleetAgents().length).toBe(0);
  });

  test("getFleetAgents returns registered remote agents", () => {
    registerMock(dispatcher, "agent-1", "worker", LINUX_CAPS, ["worker"]);

    const fleet = dispatcher.getFleetAgents();
    expect(fleet.length).toBe(1);
    expect(fleet[0].agentId).toBe("agent-1");
    expect(fleet[0].name).toBe("worker");
    expect(fleet[0].tags).toEqual(["worker"]);
    expect(fleet[0].online).toBe(true);
  });
});

describe("FleetDispatcher - capability matching", () => {
  let dispatcher: FleetDispatcher;

  beforeEach(() => {
    dispatcher = new FleetDispatcher();
  });

  test("os requirement mismatch", () => {
    registerMock(dispatcher, "mac-agent", "mac", MAC_CAPS);

    expect(() => {
      dispatcher.getAgentForTarget(
        { kind: "machine", value: "mac-agent" },
        { os: "linux" },
      );
    }).toThrow(/os: need linux, have darwin/);
  });

  test("arch requirement mismatch", () => {
    registerMock(dispatcher, "x64-agent", "x64", LINUX_CAPS);

    expect(() => {
      dispatcher.getAgentForTarget(
        { kind: "machine", value: "x64-agent" },
        { arch: "arm64" },
      );
    }).toThrow(/arch: need arm64, have x64/);
  });

  test("gpu requirement mismatch", () => {
    registerMock(dispatcher, "no-gpu", "headless", HEADLESS_CAPS);

    expect(() => {
      dispatcher.getAgentForTarget(
        { kind: "machine", value: "no-gpu" },
        { gpu: true },
      );
    }).toThrow(/gpu: required but not available/);
  });

  test("input requirement mismatch", () => {
    registerMock(dispatcher, "no-input", "headless", HEADLESS_CAPS);

    expect(() => {
      dispatcher.getAgentForTarget(
        { kind: "machine", value: "no-input" },
        { input: "xdotool" },
      );
    }).toThrow(/input/);
  });

  test("all capabilities match", () => {
    registerMock(dispatcher, "cap-agent", "full", LINUX_CAPS);

    const agent = dispatcher.getAgentForTarget(
      { kind: "machine", value: "cap-agent" },
      { os: "linux", arch: "x64", screen: true, input: "xdotool", tools: ["maim"], gpu: true },
    );
    expect(agent.agentId).toBe("cap-agent");
  });
});

describe("FleetDispatcher - remote agent mock dispatch", () => {
  test("mock remote agent receives dispatch and returns result", async () => {
    const dispatcher = new FleetDispatcher();
    const mockAgent = new MockRemoteAgent("remote-1", {
      items: [{ json: { output: "dispatched" } }],
      durationMs: 50,
    });
    dispatcher.registerFleetAgent(mockAgent, "remote-worker", LINUX_CAPS);

    const agent = dispatcher.getAgentForTarget({ kind: "machine", value: "remote-1" });
    expect(agent.agentId).toBe("remote-1");

    const result = await agent.send(
      "exec-1",
      { type: "test", version: 1, displayName: "Test", category: "test", sideEffecting: false, inputs: [], outputs: [], paramsSchema: {}, run: async () => [] } as any,
      {},
      [],
      {},
      {},
      false,
      30,
      { get: () => undefined, set: () => {} },
      "run-1",
      "auto-1",
    );

    expect(result.items[0].json.output).toBe("dispatched");
    expect(result.durationMs).toBe(50);
  });
});

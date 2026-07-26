import { describe, test, expect, beforeEach } from "bun:test";
import { RemoteAgent } from "./remote-agent.js";
import type { WssHub } from "../api/wss-hub.js";
import type { AgentNodeResultMessage, AgentDispatchMessage } from "../core/agent-protocol.js";

function createMockHub(): WssHub & {
  dispatched: AgentDispatchMessage[];
  resolveDispatch: (result: AgentNodeResultMessage) => void;
  rejectDispatch: (err: Error) => void;
} {
  let pendingResolve: ((result: AgentNodeResultMessage) => void) | null = null;
  let pendingReject: ((err: Error) => void) | null = null;

  return {
    dispatched: [] as AgentDispatchMessage[],
    resolveDispatch(result: AgentNodeResultMessage) {
      if (pendingResolve) pendingResolve(result);
    },
    rejectDispatch(err: Error) {
      if (pendingReject) pendingReject(err);
    },
    dispatchToAgent(agentId: string, msg: AgentDispatchMessage, timeoutSec: number) {
      (this as any).dispatched.push(msg);
      return new Promise<AgentNodeResultMessage>((resolve, reject) => {
        pendingResolve = resolve;
        pendingReject = reject;
        setTimeout(() => {
          reject(new Error(`Dispatch to agent ${agentId} timed out after ${timeoutSec}s`));
        }, timeoutSec * 1000);
      });
    },
    getAgentConnection: () => undefined,
    handleOpen: () => {},
    handleMessage: () => {},
    handleClose: () => {},
    broadcastToAgent: () => false,
    onMessage: () => {},
    getConnectedAgents: () => [],
    updateAgentTags: () => {},
    close: () => {},
  } as any;
}

describe("RemoteAgent", () => {
  test("construction stores agentId", () => {
    const hub = createMockHub();
    const agent = new RemoteAgent("remote-1", hub);
    expect(agent.agentId).toBe("remote-1");
  });

  test("send() dispatches via hub and resolves on node_result", async () => {
    const hub = createMockHub();
    const agent = new RemoteAgent("remote-1", hub);

    const sendPromise = agent.send(
      "exec-1",
      { type: "action.shell", version: 1, displayName: "Shell", category: "action", sideEffecting: true, inputs: [], outputs: [], paramsSchema: {}, run: async () => [] } as any,
      { command: "echo hi" },
      [],
      {},
      {},
      false,
      30,
      { get: () => undefined, set: () => {} },
      "run-1",
      "auto-1",
    );

    expect(hub.dispatched.length).toBe(1);
    expect(hub.dispatched[0].nodeExecutionId).toBe("exec-1");
    expect(hub.dispatched[0].type).toBe("dispatch");

    hub.resolveDispatch({
      type: "node_result",
      nodeExecutionId: "exec-1",
      status: "success",
      items: [{ json: { stdout: "hi" } }],
      durationMs: 50,
    });

    const result = await sendPromise;
    expect(result.items).toHaveLength(1);
    expect(result.items[0].json.stdout).toBe("hi");
    expect(result.durationMs).toBe(50);
    expect(result.error).toBeUndefined();
  });

  test("send() returns error when dispatch rejects", async () => {
    const hub = createMockHub();
    const agent = new RemoteAgent("remote-1", hub);

    const sendPromise = agent.send(
      "exec-2",
      { type: "action.shell", version: 1, displayName: "Shell", category: "action", sideEffecting: true, inputs: [], outputs: [], paramsSchema: {}, run: async () => [] } as any,
      {},
      [],
      {},
      {},
      false,
      30,
      { get: () => undefined, set: () => {} },
      "run-2",
      "auto-2",
    );

    hub.rejectDispatch(new Error("Agent not connected"));

    const result = await sendPromise;
    expect(result.error).toBe("Agent not connected");
    expect(result.items).toHaveLength(0);
    expect(result.durationMs).toBe(0);
  });

  test("send() timeout rejects and returns error", async () => {
    const hub = createMockHub();
    const agent = new RemoteAgent("remote-1", hub);

    const sendPromise = agent.send(
      "exec-3",
      { type: "action.shell", version: 1, displayName: "Shell", category: "action", sideEffecting: true, inputs: [], outputs: [], paramsSchema: {}, run: async () => [] } as any,
      {},
      [],
      {},
      {},
      false,
      0,
      { get: () => undefined, set: () => {} },
      "run-3",
      "auto-3",
    );

    const result = await sendPromise;
    expect(result.error).toContain("timed out");
  });

  test("isOnline returns false when hub has no connection", () => {
    const hub = createMockHub();
    const agent = new RemoteAgent("remote-1", hub);
    expect(agent.isOnline()).toBe(false);
  });
});

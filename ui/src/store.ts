import { create } from "zustand";
import type { Edge } from "@xyflow/react";
import type {
  SystemInfoResponse,
  AutomationResponse,
  AutomationDefinition,
  AutomationNodeData,
  FlowNode,
  RunResponse,
  NodeExecutionResponse,
} from "./types";
import {
  definitionToFlow,
  flowToDefinition,
  makeDefaultDefinition,
  generateNodeId,
  generateEdgeId,
} from "./convert";
import * as api from "./hooks/useApi";

interface AppStore {
  systemInfo: SystemInfoResponse | null;
  systemError: string | null;

  automations: AutomationResponse[];
  currentAutomationId: string | null;
  currentDefinition: AutomationDefinition | null;
  rfNodes: FlowNode[];
  rfEdges: Edge[];
  isDirty: boolean;

  selectedNodeId: string | null;
  dryRun: boolean;

  runs: RunResponse[];
  currentRunId: string | null;
  nodeExecutions: Record<string, NodeExecutionResponse[]>;

  fetchSystemInfo: () => Promise<void>;
  fetchAutomations: () => Promise<void>;
  selectAutomation: (id: string | null) => Promise<void>;
  createAutomation: (name: string) => Promise<void>;
  deleteAutomation: (id: string) => Promise<void>;
  saveAutomation: () => Promise<void>;

  setRfNodes: (nodes: FlowNode[]) => void;
  setRfEdges: (edges: Edge[]) => void;
  addNode: (
    nodeType: string,
    position: { x: number; y: number },
    name: string,
    defaultParams: Record<string, unknown>,
    inputs: { name: string }[],
    outputs: { name: string }[],
  ) => void;
  updateNodeData: (id: string, data: Partial<AutomationNodeData>) => void;
  removeNode: (id: string) => void;
  updateNodePosition: (id: string, position: { x: number; y: number }) => void;
  addEdge: (connection: {
    source: string;
    sourceHandle: string | null;
    target: string;
    targetHandle: string | null;
  }) => void;
  removeEdge: (id: string) => void;

  setSelectedNodeId: (id: string | null) => void;
  setDryRun: (v: boolean) => void;

  runCurrentAutomation: () => Promise<void>;
  fetchRuns: () => Promise<void>;
  fetchNodeExecutions: (runId: string) => Promise<void>;
  setCurrentRunId: (id: string | null) => void;
}

export const useAppStore = create<AppStore>((set, get) => ({
  systemInfo: null,
  systemError: null,

  automations: [],
  currentAutomationId: null,
  currentDefinition: null,
  rfNodes: [],
  rfEdges: [],
  isDirty: false,

  selectedNodeId: null,
  dryRun: false,

  runs: [],
  currentRunId: null,
  nodeExecutions: {},

  fetchSystemInfo: async () => {
    try {
      const info = await api.getSystemInfo();
      set({ systemInfo: info, systemError: null });
    } catch (e) {
      set({ systemError: (e as Error).message });
    }
  },

  fetchAutomations: async () => {
    try {
      const automations = await api.listAutomations();
      set({ automations });
    } catch {
      /* ignore */
    }
  },

  selectAutomation: async (id: string | null) => {
    set({
      currentAutomationId: id,
      selectedNodeId: null,
      currentRunId: null,
      nodeExecutions: {},
    });
    if (!id) {
      set({ currentDefinition: null, rfNodes: [], rfEdges: [], isDirty: false });
      return;
    }
    try {
      const resp = await api.getAutomation(id);
      const def = resp.draft ?? makeDefaultDefinition(resp.name);
      const { nodes, edges } = definitionToFlow(def);
      set({ currentDefinition: def, rfNodes: nodes, rfEdges: edges, isDirty: false });
    } catch {
      set({ currentDefinition: null, rfNodes: [], rfEdges: [] });
    }
  },

  createAutomation: async (name: string) => {
    const def = makeDefaultDefinition(name);
    const resp = await api.createAutomation(name, def);
    set((s) => ({ automations: [...s.automations, resp] }));
    await get().selectAutomation(resp.id);
  },

  deleteAutomation: async (id: string) => {
    await api.deleteAutomation(id);
    set((s) => ({
      automations: s.automations.filter((a) => a.id !== id),
      currentAutomationId: s.currentAutomationId === id ? null : s.currentAutomationId,
      currentDefinition: s.currentAutomationId === id ? null : s.currentDefinition,
      rfNodes: s.currentAutomationId === id ? [] : s.rfNodes,
      rfEdges: s.currentAutomationId === id ? [] : s.rfEdges,
    }));
  },

  saveAutomation: async () => {
    const { currentAutomationId, rfNodes, rfEdges, currentDefinition } = get();
    if (!currentAutomationId || !currentDefinition) return;
    const def = flowToDefinition(
      rfNodes,
      rfEdges,
      currentDefinition.name,
      currentDefinition.settings,
    );
    set({ currentDefinition: def, isDirty: false });
    try {
      const resp = await api.updateAutomation(currentAutomationId, def);
      set((s) => ({
        automations: s.automations.map((a) => (a.id === resp.id ? resp : a)),
      }));
    } catch {
      /* ignore */
    }
  },

  setRfNodes: (nodes: FlowNode[]) => {
    set({ rfNodes: nodes, isDirty: true });
  },

  setRfEdges: (edges: Edge[]) => {
    set({ rfEdges: edges, isDirty: true });
  },

  addNode: (nodeType, position, name, defaultParams, _inputs, _outputs) => {
    const id = generateNodeId();
    const category = nodeType.split(".")[0] ?? "";
    const resolvedCategory =
      category === "system" || category === "fs" || category === "http"
        ? "execution"
        : category === "error"
          ? "logic"
          : category;

    void _inputs;
    void _outputs;

    const newNode: FlowNode = {
      id,
      type: "automationNode",
      position,
      data: {
        nodeType,
        category: resolvedCategory,
        name,
        target: { kind: "local" },
        params: defaultParams,
        disabled: false,
        typeVersion: 1,
      },
    };

    set((s) => ({
      rfNodes: [...s.rfNodes, newNode],
      isDirty: true,
    }));
  },

  updateNodeData: (id, data) => {
    set((s) => ({
      rfNodes: s.rfNodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...data } } : n,
      ),
      isDirty: true,
    }));
  },

  removeNode: (id) => {
    set((s) => ({
      rfNodes: s.rfNodes.filter((n) => n.id !== id),
      rfEdges: s.rfEdges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
      isDirty: true,
    }));
  },

  updateNodePosition: (id, position) => {
    set((s) => ({
      rfNodes: s.rfNodes.map((n) =>
        n.id === id ? { ...n, position } : n,
      ),
      isDirty: true,
    }));
  },

  addEdge: (connection) => {
    const source = connection.source;
    const target = connection.target;
    const sourceHandle = connection.sourceHandle ?? "out";
    const targetHandle = connection.targetHandle ?? "in";
    const id = generateEdgeId(source, sourceHandle, target, targetHandle);

    set((s) => {
      const exists = s.rfEdges.some(
        (e) =>
          e.source === source &&
          e.sourceHandle === sourceHandle &&
          e.target === target &&
          e.targetHandle === targetHandle,
      );
      if (exists) return s;
      return {
        rfEdges: [
          ...s.rfEdges,
          {
            id,
            source,
            target,
            sourceHandle,
            targetHandle,
            type: "smoothstep",
            animated: true,
          },
        ],
        isDirty: true,
      };
    });
  },

  removeEdge: (id) => {
    set((s) => ({
      rfEdges: s.rfEdges.filter((e) => e.id !== id),
      isDirty: true,
    }));
  },

  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  setDryRun: (v) => set({ dryRun: v }),

  runCurrentAutomation: async () => {
    const { currentAutomationId, dryRun } = get();
    if (!currentAutomationId) return;

    await get().saveAutomation();

    try {
      const run = await api.runAutomation(currentAutomationId, {
        mode: "manual",
        dryRun,
      });
      set((s) => ({ runs: [run, ...s.runs], currentRunId: run.id }));
    } catch {
      /* ignore */
    }
  },

  fetchRuns: async () => {
    const { currentAutomationId } = get();
    try {
      const runs = await api.listRuns(currentAutomationId ?? undefined);
      set({ runs });
    } catch {
      /* ignore */
    }
  },

  fetchNodeExecutions: async (runId: string) => {
    try {
      const executions = await api.listNodeExecutions(runId);
      set((s) => ({
        nodeExecutions: { ...s.nodeExecutions, [runId]: executions },
      }));
    } catch {
      /* ignore */
    }
  },

  setCurrentRunId: (id) => set({ currentRunId: id }),
}));

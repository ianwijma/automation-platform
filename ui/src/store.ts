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
  AutomationVersionResponse,
  AiDiff,
  AiSettingsResponse,
  AgentResponse,
} from "./types";
import {
  definitionToFlow,
  flowToDefinition,
  makeDefaultDefinition,
  generateNodeId,
  generateEdgeId,
} from "./convert";
import * as api from "./hooks/useApi";

interface AiChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  diffs?: AiDiff[];
}

interface AppStore {
  systemInfo: SystemInfoResponse | null;
  systemError: string | null;

  automations: AutomationResponse[];
  currentAutomationId: string | null;
  currentDefinition: AutomationDefinition | null;
  rfNodes: FlowNode[];
  rfEdges: Edge[];
  isDirty: boolean;
  invalidParams: Record<string, string>;

  selectedNodeId: string | null;
  dryRun: boolean;
  pinData: Record<string, import("./types").NodeItem[]>;
  setPin: (nodeId: string, items: import("./types").NodeItem[] | null) => void;
  aiBaseRevision: string | null;

  runs: RunResponse[];
  currentRunId: string | null;
  selectedNodeExecId: string | null;
  nodeExecutions: Record<string, NodeExecutionResponse[]>;

  versions: AutomationVersionResponse[];
  previewVersion: AutomationVersionResponse | null;
  isPreviewMode: boolean;

  aiMessages: AiChatMessage[];
  aiLoading: boolean;
  aiDiffApproval: Record<string, boolean>;
  showAiPanel: boolean;
  showVersionHistory: boolean;

  aiSettings: AiSettingsResponse | null;

  agents: AgentResponse[];
  settingsOpen: boolean;
  saveError: string | null;
  actionError: string | null;

  fetchSystemInfo: () => Promise<void>;
  fetchAutomations: () => Promise<void>;
  fetchAgents: () => Promise<void>;
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
  executeNode: (
    nodeId: string,
    fresh?: boolean,
    inputData?: any[],
  ) => Promise<void>;
  setSelectedNodeExecId: (id: string | null) => void;

  fetchVersions: () => Promise<void>;
  setPreviewVersion: (version: AutomationVersionResponse | null) => void;
  clearPreviewVersion: () => Promise<void>;
  revertToVersion: (versionNo: number) => Promise<void>;
  labelVersion: (versionId: string, label: string) => Promise<void>;

  sendAiMessage: (message: string) => Promise<void>;
  toggleDiffApproval: (diffKey: string) => void;
  applyApprovedDiffs: () => Promise<void>;
  setShowAiPanel: (show: boolean) => void;
  setShowVersionHistory: (show: boolean) => void;
  toggleSettings: () => void;

  activateAutomation: (id: string) => Promise<void>;
  deactivateAutomation: (id: string) => Promise<void>;

  fetchAiSettings: () => Promise<void>;
  updateAiSettings: (settings: {
    aiApiKey?: string;
    aiModel?: string;
    aiEndpoint?: string;
  }) => Promise<void>;
}

let aiMsgId = 0;

export const useAppStore = create<AppStore>((set, get) => ({
  systemInfo: null,
  systemError: null,

  automations: [],
  currentAutomationId: null,
  currentDefinition: null,
  rfNodes: [],
  rfEdges: [],
  isDirty: false,
  invalidParams: {},

  selectedNodeId: null,
  dryRun: false,
  pinData: {},
  aiBaseRevision: null,
  setPin: (nodeId, items) =>
    set((s) => {
      const pinData = { ...s.pinData };
      if (items) pinData[nodeId] = items;
      else delete pinData[nodeId];
      return { pinData };
    }),

  runs: [],
  currentRunId: null,
  selectedNodeExecId: null,
  nodeExecutions: {},

  versions: [],
  previewVersion: null,
  isPreviewMode: false,

  aiMessages: [],
  aiLoading: false,
  aiDiffApproval: {},
  showAiPanel: false,
  showVersionHistory: false,

  aiSettings: null,

  agents: [],

  settingsOpen: false,
  saveError: null,
  actionError: null,

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
    } catch (error) {
      set({ actionError: (error as Error).message });
    }
  },

  fetchAgents: async () => {
    try {
      const res = await fetch("/api/agents");
      if (res.ok) {
        const agents: AgentResponse[] = await res.json();
        set({ agents });
      }
    } catch (error) {
      set({ actionError: (error as Error).message });
    }
  },

  selectAutomation: async (id: string | null) => {
    if (
      get().isDirty &&
      get().currentAutomationId !== id &&
      !window.confirm("Discard unsaved changes?")
    )
      return;
    set({
      currentAutomationId: id,
      aiMessages: [],
      aiDiffApproval: {},
      aiBaseRevision: null,
      aiLoading: false,
      pinData: {},
      runs: [],
      selectedNodeId: null,
      currentRunId: null,
      nodeExecutions: {},
      previewVersion: null,
      isPreviewMode: false,
      versions: [],
    });
    if (!id) {
      set({
        currentDefinition: null,
        rfNodes: [],
        rfEdges: [],
        isDirty: false,
      });
      return;
    }
    try {
      const resp = await api.getAutomation(id);
      if (get().currentAutomationId !== id) return;
      const def = resp.draft ?? makeDefaultDefinition(resp.name);
      const { nodes, edges } = definitionToFlow(def);
      set({
        currentDefinition: def,
        rfNodes: nodes,
        rfEdges: edges,
        isDirty: false,
        invalidParams: {},
      });
    } catch {
      if (get().currentAutomationId === id)
        set({ currentDefinition: null, rfNodes: [], rfEdges: [] });
    }
  },

  createAutomation: async (name: string) => {
    try {
      const def = makeDefaultDefinition(name);
      const resp = await api.createAutomation(name, def);
      set((s) => ({
        automations: [...s.automations, resp],
        actionError: null,
      }));
      await get().selectAutomation(resp.id);
    } catch (e) {
      set({ actionError: (e as Error).message });
    }
  },

  deleteAutomation: async (id: string) => {
    try {
      await api.deleteAutomation(id);
      set((s) => ({
        automations: s.automations.filter((a) => a.id !== id),
        currentAutomationId:
          s.currentAutomationId === id ? null : s.currentAutomationId,
        currentDefinition:
          s.currentAutomationId === id ? null : s.currentDefinition,
        rfNodes: s.currentAutomationId === id ? [] : s.rfNodes,
        rfEdges: s.currentAutomationId === id ? [] : s.rfEdges,
        actionError: null,
      }));
    } catch (e) {
      set({ actionError: (e as Error).message });
    }
  },

  saveAutomation: async () => {
    if (Object.keys(get().invalidParams).length) {
      set({
        saveError: "Correct invalid parameter values before saving or running.",
        isDirty: true,
      });
      return;
    }
    const {
      currentAutomationId,
      rfNodes,
      rfEdges,
      currentDefinition,
      isPreviewMode,
    } = get();
    if (!currentAutomationId || !currentDefinition || isPreviewMode) return;
    const def = flowToDefinition(
      rfNodes,
      rfEdges,
      currentDefinition.name,
      currentDefinition.settings,
    );
    const savedNodes = rfNodes,
      savedEdges = rfEdges;
    set({ currentDefinition: def, saveError: null });
    try {
      const resp = await api.updateAutomation(
        currentAutomationId,
        def,
        get().automations.find((a) => a.id === currentAutomationId)?.revision,
      );
      set((s) => ({
        automations: s.automations.map((a) => (a.id === resp.id ? resp : a)),
        isDirty:
          s.currentAutomationId === currentAutomationId &&
          (s.rfNodes !== savedNodes ||
            s.rfEdges !== savedEdges ||
            s.currentDefinition !== def),
        saveError: null,
      }));
    } catch (e) {
      set({ isDirty: true, saveError: (e as Error).message });
    }
  },

  setRfNodes: (nodes: FlowNode[]) => {
    if (get().isPreviewMode) return;
    set({ rfNodes: nodes, isDirty: true });
  },

  setRfEdges: (edges: Edge[]) => {
    if (get().isPreviewMode) return;
    set({ rfEdges: edges, isDirty: true });
  },

  addNode: (nodeType, position, name, defaultParams, _inputs, _outputs) => {
    if (get().isPreviewMode) return;
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
    if (get().isPreviewMode) return;
    set((s) => ({
      rfNodes: s.rfNodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...data } } : n,
      ),
      isDirty: true,
    }));
  },

  removeNode: (id) => {
    if (get().isPreviewMode) return;
    set((s) => ({
      rfNodes: s.rfNodes.filter((n) => n.id !== id),
      invalidParams: Object.fromEntries(
        Object.entries(s.invalidParams).filter(
          ([key]) => !key.startsWith(id + ":"),
        ),
      ),
      rfEdges: s.rfEdges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
      isDirty: true,
    }));
  },

  updateNodePosition: (id, position) => {
    if (get().isPreviewMode) return;
    set((s) => ({
      rfNodes: s.rfNodes.map((n) => (n.id === id ? { ...n, position } : n)),
      isDirty: true,
    }));
  },

  addEdge: (connection) => {
    if (get().isPreviewMode) return;
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
    if (get().isPreviewMode) return;
    set((s) => ({
      rfEdges: s.rfEdges.filter((e) => e.id !== id),
      isDirty: true,
    }));
  },

  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  setDryRun: (v) => set({ dryRun: v }),

  runCurrentAutomation: async () => {
    const { currentAutomationId, dryRun } = get();
    if (!currentAutomationId || get().isPreviewMode) return;

    await get().saveAutomation();
    if (
      get().saveError ||
      get().isDirty ||
      get().currentAutomationId !== currentAutomationId
    )
      return;

    try {
      const run = await api.runAutomation(currentAutomationId, {
        mode: dryRun ? "dry" : "manual",
        dryRun,
        pinData: get().pinData,
      });
      set((s) => ({ runs: [run, ...s.runs], currentRunId: run.id }));
    } catch (error) {
      set({ actionError: (error as Error).message });
    }
  },

  fetchRuns: async () => {
    const { currentAutomationId } = get();
    try {
      const runs = await api.listRuns(currentAutomationId ?? undefined);
      if (get().currentAutomationId === currentAutomationId) set({ runs });
    } catch (error) {
      set({ actionError: (error as Error).message });
    }
  },

  fetchNodeExecutions: async (runId: string) => {
    try {
      const run = await api.getRun(runId);
      const executions = run.nodeExecutions ?? [];
      set((s) => ({
        nodeExecutions: { ...s.nodeExecutions, [runId]: executions },
      }));
    } catch (error) {
      set({ actionError: (error as Error).message });
    }
  },

  setCurrentRunId: (id) => set({ currentRunId: id }),

  executeNode: async (nodeId, fresh = false, inputData?) => {
    const { currentAutomationId, currentDefinition, saveAutomation } = get();
    if (!currentAutomationId || !currentDefinition) return;

    if (get().isPreviewMode) return;
    await saveAutomation();
    if (
      get().saveError ||
      get().isDirty ||
      get().currentAutomationId !== currentAutomationId
    )
      return;

    try {
      const run = await api.runNode(currentAutomationId, nodeId, {
        fresh,
        inputData,
        dryRun: get().dryRun,
      });
      set((s) => ({
        runs: [run, ...s.runs],
        currentRunId: run.id,
        selectedNodeExecId: null,
      }));
      const { fetchNodeExecutions } = get();
      await fetchNodeExecutions(run.id);
      const { nodeExecutions } = get();
      const execs = nodeExecutions[run.id] ?? [];
      const targetExec = execs.find((e: any) => e.nodeId === nodeId);
      if (targetExec) {
        set({ selectedNodeExecId: targetExec.id });
      }
    } catch (error) {
      set({ actionError: (error as Error).message });
    }
  },

  setSelectedNodeExecId: (id) => set({ selectedNodeExecId: id }),

  fetchVersions: async () => {
    const { currentAutomationId } = get();
    if (!currentAutomationId) return;
    try {
      const versions = await api.listVersions(currentAutomationId);
      set({ versions });
    } catch (error) {
      set({ actionError: (error as Error).message });
    }
  },

  setPreviewVersion: (version: AutomationVersionResponse | null) => {
    if (!version) {
      set({ previewVersion: null, isPreviewMode: false });
      return;
    }
    const { nodes, edges } = definitionToFlow(version.definition);
    set({
      previewVersion: version,
      isPreviewMode: true,
      rfNodes: nodes,
      rfEdges: edges,
      selectedNodeId: null,
    });
  },

  clearPreviewVersion: async () => {
    const { currentAutomationId } = get();
    set({ previewVersion: null, isPreviewMode: false });
    if (currentAutomationId) {
      await get().selectAutomation(currentAutomationId);
    }
  },

  revertToVersion: async (versionNo: number) => {
    if (!window.confirm("Are you sure you want to revert to this version?"))
      return;
    const { currentAutomationId } = get();
    if (!currentAutomationId) return;
    try {
      const resp = await api.revertToVersion(currentAutomationId, versionNo);
      const { nodes, edges } = definitionToFlow(
        resp.draft ?? makeDefaultDefinition(resp.name),
      );
      set({
        currentDefinition: resp.draft,
        rfNodes: nodes,
        rfEdges: edges,
        isDirty: false,
        isPreviewMode: false,
        previewVersion: null,
      });
      await get().fetchVersions();
    } catch (error) {
      set({ actionError: (error as Error).message });
    }
  },

  labelVersion: async (versionId: string, label: string) => {
    const { currentAutomationId } = get();
    if (!currentAutomationId) return;
    try {
      await api.labelVersion(currentAutomationId, versionId, label);
      await get().fetchVersions();
    } catch (error) {
      set({ actionError: (error as Error).message });
    }
  },

  sendAiMessage: async (message: string) => {
    const { currentAutomationId, aiMessages } = get();
    if (get().isPreviewMode) return;
    await get().saveAutomation();
    if (get().saveError || get().isDirty) return;
    const userMsg: AiChatMessage = {
      id: `ai-${++aiMsgId}`,
      role: "user",
      content: message,
    };

    set((s) => ({
      aiMessages: [...s.aiMessages, userMsg],
      aiLoading: true,
      aiDiffApproval: {},
    }));

    const chatHistory = [...aiMessages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const result = await api.sendAiChat(
        chatHistory,
        currentAutomationId ?? undefined,
      );
      if (get().currentAutomationId !== currentAutomationId) return;
      set({ aiBaseRevision: result.baseRevision ?? null });
      const assistantMsg: AiChatMessage = {
        id: `ai-${++aiMsgId}`,
        role: "assistant",
        content: result.message,
        diffs: result.diffs,
      };
      set((s) => ({
        aiMessages: [...s.aiMessages, assistantMsg],
        aiLoading: false,
      }));
    } catch (e) {
      if (get().currentAutomationId !== currentAutomationId) return;
      const errorMsg: AiChatMessage = {
        id: `ai-${++aiMsgId}`,
        role: "assistant",
        content: `Error: ${(e as Error).message}`,
      };
      set((s) => ({
        aiMessages: [...s.aiMessages, errorMsg],
        aiLoading: false,
      }));
    }
  },

  toggleDiffApproval: (diffKey: string) => {
    set((s) => ({
      aiDiffApproval: {
        ...s.aiDiffApproval,
        [diffKey]: !s.aiDiffApproval[diffKey],
      },
    }));
  },

  applyApprovedDiffs: async () => {
    const { currentAutomationId, aiMessages, aiDiffApproval } = get();
    if (get().isPreviewMode || get().isDirty || !get().aiBaseRevision) {
      set({
        actionError: "Save your changes and request a fresh AI proposal first.",
      });
      return;
    }
    if (!currentAutomationId) return;

    const allDiffs: AiDiff[] = [];
    for (const msg of aiMessages) {
      if (msg.diffs) {
        msg.diffs.forEach((diff, i) => {
          const key = `${msg.id}-diff-${i}`;
          if (aiDiffApproval[key]) {
            allDiffs.push(diff);
          }
        });
      }
    }

    if (allDiffs.length === 0) return;
    const savedDefinition = get().currentDefinition;

    try {
      const result = await api.applyAiDiffs(
        currentAutomationId,
        allDiffs,
        get().aiBaseRevision!,
      );
      if (get().currentAutomationId !== currentAutomationId) return;
      if (get().isDirty || get().currentDefinition !== savedDefinition) {
        set({
          actionError:
            "AI changes were saved while you edited. Reload the draft before continuing.",
        });
        return;
      }
      const { nodes, edges } = definitionToFlow(result.definition);
      set({
        currentDefinition: result.definition,
        automations: get().automations.map((a) =>
          a.id === currentAutomationId
            ? { ...a, draft: result.definition, revision: result.revision }
            : a,
        ),
        aiBaseRevision: null,
        rfNodes: nodes,
        rfEdges: edges,
        isDirty: false,
        aiDiffApproval: {},
      });
      await get().fetchVersions();
    } catch (error) {
      set({ actionError: (error as Error).message });
    }
  },

  setShowAiPanel: (show) => set({ showAiPanel: show }),
  setShowVersionHistory: (show) => set({ showVersionHistory: show }),
  toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),

  activateAutomation: async (id: string) => {
    try {
      const resp = await api.activateAutomation(id);
      set((s) => ({
        automations: s.automations.map((a) => (a.id === resp.id ? resp : a)),
        actionError: null,
      }));
    } catch (e) {
      set({ actionError: (e as Error).message });
    }
  },

  deactivateAutomation: async (id: string) => {
    try {
      const resp = await api.deactivateAutomation(id);
      set((s) => ({
        automations: s.automations.map((a) => (a.id === resp.id ? resp : a)),
        actionError: null,
      }));
    } catch (e) {
      set({ actionError: (e as Error).message });
    }
  },

  fetchAiSettings: async () => {
    try {
      const settings = await api.getSettings();
      set({ aiSettings: settings });
    } catch (error) {
      set({ actionError: (error as Error).message });
    }
  },

  updateAiSettings: async (settings) => {
    try {
      const result = await api.updateSettings(settings);
      set({ aiSettings: result });
    } catch (error) {
      set({ actionError: (error as Error).message });
    }
  },
}));

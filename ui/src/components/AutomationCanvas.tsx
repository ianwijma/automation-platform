import { useCallback, useRef, useState, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  applyNodeChanges,
  applyEdgeChanges,
  BackgroundVariant,
  type OnConnect,
  BaseEdge,
  type EdgeProps,
  getSmoothStepPath,
} from "@xyflow/react";
import type { Node, Edge, NodeChange, EdgeChange } from "@xyflow/react";
import type { PaletteNodeType, AutomationNodeData, FlowNode } from "../types";
import { useAppStore } from "../store";
import { AutomationNodeFlow } from "./CustomNodes";
import { NodePalette, getPalettePorts } from "./NodePalette";
import { Layers } from "lucide-react";

const nodeTypes = { automationNode: AutomationNodeFlow };

function GroupLegend({ lanes }: { lanes: { key: string; label: string; color: { bg: string; border: string } }[] }) {
  if (lanes.length === 0) return null;
  return (
    <div className="absolute top-2 right-2 z-10 flex flex-col gap-1 rounded-lg border border-gray-700 bg-gray-900/90 p-2">
      <span className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Target Groups</span>
      {lanes.map((lane) => {
        const c = lane.color;
        return (
          <div key={lane.key} className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-sm" style={{ background: c.border }} />
            <span className="text-[11px] text-gray-300">{lane.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function DeletableEdge(props: EdgeProps) {
  const [hovered, setHovered] = useState(false);
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition ?? props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition ?? props.targetPosition,
    borderRadius: 8,
  });

  return (
    <g
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        style={{ cursor: "pointer" }}
      />
      <BaseEdge path={path} style={props.style} markerEnd={props.markerEnd} />
      {hovered && (
        <g transform={`translate(${labelX}, ${labelY})`}>
          <circle
            r={10}
            fill="#1f2937"
            stroke="#374151"
            strokeWidth={1}
            style={{ cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              useAppStore.getState().removeEdge(props.id);
            }}
          />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fill={hovered ? "#ef4444" : "#6b7280"}
            fontSize={10}
            style={{ cursor: "pointer", pointerEvents: "all" }}
            onClick={(e) => {
              e.stopPropagation();
              useAppStore.getState().removeEdge(props.id);
            }}
          >
            ×
          </text>
        </g>
      )}
    </g>
  );
}

const edgeTypes = { deletable: DeletableEdge };

function AutomationCanvasInner() {
  const rfNodes = useAppStore((s) => s.rfNodes);
  const rfEdges = useAppStore((s) => s.rfEdges);
  const setRfNodes = useAppStore((s) => s.setRfNodes);
  const setRfEdges = useAppStore((s) => s.setRfEdges);
  const addNode = useAppStore((s) => s.addNode);
  const addEdgeAction = useAppStore((s) => s.addEdge);
  const removeEdgeAction = useAppStore((s) => s.removeEdge);
  const setSelectedNodeId = useAppStore((s) => s.setSelectedNodeId);
  const selectedNodeId = useAppStore((s) => s.selectedNodeId);

  const [groupByTarget, setGroupByTarget] = useState(false);

  const reactFlow = useReactFlow();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const updated = applyNodeChanges(changes, rfNodes as Node[]);
      setRfNodes(updated as unknown as FlowNode[]);
    },
    [rfNodes, setRfNodes],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const updated = applyEdgeChanges(changes, rfEdges);
      setRfEdges(updated);
    },
    [rfEdges, setRfEdges],
  );

  const onEdgesDelete = useCallback(
    (edges: Edge[]) => {
      for (const edge of edges) {
        removeEdgeAction(edge.id);
      }
    },
    [removeEdgeAction],
  );

  const onConnect: OnConnect = useCallback(
    (connection) => {
      addEdgeAction({
        source: connection.source,
        sourceHandle: connection.sourceHandle,
        target: connection.target,
        targetHandle: connection.targetHandle,
      });
    },
    [addEdgeAction],
  );

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id);
    },
    [setSelectedNodeId],
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, [setSelectedNodeId]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const raw = event.dataTransfer.getData("application/automation-node");
      if (!raw) return;

      let paletteNode: PaletteNodeType;
      try {
        paletteNode = JSON.parse(raw) as PaletteNodeType;
      } catch {
        return;
      }

      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!bounds) return;

      const position = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const ports = getPalettePorts(paletteNode.type);
      addNode(
        paletteNode.type,
        position,
        paletteNode.displayName,
        paletteNode.defaultParams,
        ports.inputs,
        ports.outputs,
      );
    },
    [reactFlow, addNode],
  );

  const DEFAULT_LANE_COLOR = { bg: "rgba(59,130,246,0.06)", border: "rgba(59,130,246,0.2)" };
  const TARGET_LANE_COLORS = [
    { bg: "rgba(59,130,246,0.06)", border: "rgba(59,130,246,0.2)" },
    { bg: "rgba(34,197,94,0.06)", border: "rgba(34,197,94,0.2)" },
    { bg: "rgba(249,115,22,0.06)", border: "rgba(249,115,22,0.2)" },
    { bg: "rgba(168,85,247,0.06)", border: "rgba(168,85,247,0.2)" },
    { bg: "rgba(236,72,153,0.06)", border: "rgba(236,72,153,0.2)" },
  ];

  const groupLanes = useMemo(() => {
    if (!groupByTarget) return [];
    const groups = new Map<string, { nodes: FlowNode[]; label: string }>();
    for (const n of rfNodes) {
      const data = n.data as unknown as AutomationNodeData;
      const target = data.target as { kind: string; value?: string };
      const key = target.kind === "local" ? "local" : `${target.kind}:${target.value ?? target.kind}`;
      const label = target.kind === "local"
        ? "Local"
        : target.kind === "machine"
          ? (target.value ?? "machine")
          : target.kind === "tag"
            ? `Tag: ${target.value ?? "tag"}`
            : "Any";
      if (!groups.has(key)) groups.set(key, { nodes: [], label });
      groups.get(key)!.nodes.push(n);
    }
    return Array.from(groups.entries()).map(([key, group], i) => ({
      key,
      label: group.label,
      nodes: group.nodes,
      color: TARGET_LANE_COLORS[i % TARGET_LANE_COLORS.length] ?? DEFAULT_LANE_COLOR,
    }));
  }, [rfNodes, groupByTarget]);

  const groupedPositions = useMemo(() => {
    if (!groupByTarget || groupLanes.length === 0) return null;
    const map = new Map<string, { x: number; y: number }>();
    let colX = 0;
    for (const lane of groupLanes) {
      let rowY = 0;
      for (const node of lane.nodes) {
        map.set(node.id, { x: colX, y: rowY });
        rowY += 120;
      }
      colX += 350;
    }
    return map;
  }, [groupByTarget, groupLanes]);

  const displayedNodes: Node[] = (selectedNodeId
    ? rfNodes.map((n) =>
        n.id === selectedNodeId ? { ...n, selected: true } : { ...n, selected: false },
      )
    : rfNodes).map((n) => {
    if (groupedPositions && groupedPositions.has(n.id)) {
      const pos = groupedPositions.get(n.id)!;
      return { ...n, position: pos };
    }
    return n;
  }) as Node[];

  return (
    <div className="flex h-full">
      <div className="w-48 shrink-0 border-r border-gray-800 bg-gray-950">
        <NodePalette />
      </div>
      <div ref={reactFlowWrapper} className="flex-1 relative">
        <button
          onClick={() => setGroupByTarget(!groupByTarget)}
          className={`absolute top-2 left-2 z-10 flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
            groupByTarget
              ? "border-indigo-500/50 bg-indigo-500/20 text-indigo-300"
              : "border-gray-700 bg-gray-900 text-gray-400 hover:text-gray-300"
          }`}
          title="Group nodes by target"
        >
          <Layers className="h-3.5 w-3.5" />
          Group by Target
        </button>
        {groupByTarget && <GroupLegend lanes={groupLanes} />}
        <ReactFlow
          nodes={displayedNodes}
          edges={rfEdges as Edge[]}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onEdgesDelete={onEdgesDelete}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onDragOver={onDragOver}
          onDrop={onDrop}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          defaultEdgeOptions={{ type: "deletable", animated: true, style: { strokeWidth: 2 } }}
          connectionLineStyle={{ stroke: "#6366f1", strokeWidth: 2 }}
          proOptions={{ hideAttribution: true }}
          className="bg-gray-950"
          deleteKeyCode="Backspace"
          elementsSelectable
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#374151" />
          <Controls
            position="bottom-left"
            className="!bg-gray-900 !border-gray-700 !rounded-lg !shadow-lg"
          />
          <MiniMap
            nodeColor={(node) => {
              const data = node.data as AutomationNodeData | undefined;
              if (data?.category) {
                const cat = data.category as string;
                const colors: Record<string, string> = {
                  trigger: "#3b82f6",
                  execution: "#22c55e",
                  logic: "#f97316",
                  state: "#a855f7",
                  vision: "#ec4899",
                  input: "#14b8a6",
                };
                return colors[cat] ?? "#6b7280";
              }
              return "#6b7280";
            }}
            className="!bg-gray-900 !border-gray-700 !rounded-lg"
            maskColor="rgba(0,0,0,0.7)"
          />
        </ReactFlow>
      </div>
    </div>
  );
}

export function AutomationCanvas() {
  return <AutomationCanvasInner />;
}

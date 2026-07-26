import { useCallback, useRef } from "react";
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
} from "@xyflow/react";
import type { Node, Edge, NodeChange, EdgeChange } from "@xyflow/react";
import type { PaletteNodeType, AutomationNodeData, FlowNode } from "../types";
import { useAppStore } from "../store";
import { AutomationNodeFlow } from "./CustomNodes";
import { NodePalette, getPalettePorts } from "./NodePalette";

const nodeTypes = { automationNode: AutomationNodeFlow };

function AutomationCanvasInner() {
  const rfNodes = useAppStore((s) => s.rfNodes);
  const rfEdges = useAppStore((s) => s.rfEdges);
  const setRfNodes = useAppStore((s) => s.setRfNodes);
  const setRfEdges = useAppStore((s) => s.setRfEdges);
  const addNode = useAppStore((s) => s.addNode);
  const addEdgeAction = useAppStore((s) => s.addEdge);
  const setSelectedNodeId = useAppStore((s) => s.setSelectedNodeId);
  const selectedNodeId = useAppStore((s) => s.selectedNodeId);

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

  const displayedNodes: Node[] = (selectedNodeId
    ? rfNodes.map((n) =>
        n.id === selectedNodeId ? { ...n, selected: true } : { ...n, selected: false },
      )
    : rfNodes) as Node[];

  return (
    <div className="flex h-full">
      <div className="w-48 shrink-0 border-r border-gray-800 bg-gray-950">
        <NodePalette />
      </div>
      <div ref={reactFlowWrapper} className="flex-1">
        <ReactFlow
          nodes={displayedNodes}
          edges={rfEdges as Edge[]}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onDragOver={onDragOver}
          onDrop={onDrop}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          defaultEdgeOptions={{ type: "smoothstep", animated: true }}
          connectionLineStyle={{ stroke: "#6366f1", strokeWidth: 2 }}
          proOptions={{ hideAttribution: true }}
          className="bg-gray-950"
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

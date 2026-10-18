import { validateDefinition } from "../core/schemas.js";
import { z } from "zod";
export const diffSchema = z.object({
  op: z.enum([
    "add-node",
    "remove-node",
    "update-node-params",
    "add-edge",
    "remove-edge",
    "update-settings",
  ]),
  path: z.string(),
  value: z.unknown(),
  description: z.string(),
});
import type {
  AutomationDefinition,
  AutomationNode,
  AutomationEdge,
  AutomationSettings,
} from "../core/types.js";
import type { AiChatResponse, AiDiff } from "../core/api-types.js";
import { nodeRegistry } from "../core/node-registry.js";

interface ChatMessage {
  role: string;
  content: string;
}

export class AiService {
  private apiKey: string;
  private defaultModel: string;
  private endpoint: string;

  constructor(apiKey: string, defaultModel: string, endpoint?: string) {
    this.apiKey = apiKey;
    this.defaultModel = defaultModel;
    this.endpoint = endpoint ?? "https://openrouter.ai/api/v1";
  }

  async chat(
    messages: ChatMessage[],
    automation?: AutomationDefinition,
  ): Promise<AiChatResponse> {
    const systemPrompt = this.buildSystemPrompt(automation);
    const allMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    const response = await fetch(`${this.endpoint}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(60_000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "HTTP-Referer": "https://automation-platform.local",
        "X-Title": "Automation Platform",
      },
      body: JSON.stringify({
        model: this.defaultModel,
        messages: allMessages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `AI API error ${response.status}: ${this.apiKey ? errorText.replaceAll(this.apiKey, "[REDACTED]").slice(0, 2000) : errorText.slice(0, 2000)}`,
      );
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    const content = data.choices[0]?.message?.content ?? "";
    const { message, diffs } = this.parseResponse(content);
    return { message, diffs };
  }

  async listModels(): Promise<string[]> {
    const response = await fetch(`${this.endpoint}/models`, {
      signal: AbortSignal.timeout(15_000),
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status}`);
    }

    const data = (await response.json()) as {
      data: Array<{ id: string }>;
    };

    return data.data.map((m) => m.id).sort();
  }

  private buildSystemPrompt(automation?: AutomationDefinition): string {
    const nodeTypes = nodeRegistry.all().map((def) => ({
      type: def.type,
      version: def.version,
      displayName: def.displayName,
      category: def.category,
      params: def.paramsSchema,
      inputs: def.inputs.map((i) => i.name),
      outputs: def.outputs.map((o) => o.name),
    }));

    let prompt =
      "You are an automation assistant. You help build automations for a Linux automation platform. ";
    prompt += "The platform has these node types:\n\n";
    prompt += "```json\n" + JSON.stringify(nodeTypes, null, 2) + "\n```\n\n";
    prompt +=
      "When suggesting changes, express them as structured diffs in a JSON code block. ";
    prompt += "The diffs should be in this format:\n\n";
    prompt += "```json\n";
    prompt += "[\n";
    prompt += "  {\n";
    prompt += '    "op": "add-node",\n';
    prompt += '    "path": "nodes",\n';
    prompt +=
      '    "value": { "id": "...", "type": "...", "typeVersion": 1, "name": "...", "target": { "kind": "local" }, "params": {}, "disabled": false, "position": { "x": 0, "y": 0 } },\n';
    prompt += '    "description": "Add a manual trigger node"\n';
    prompt += "  }\n";
    prompt += "]\n";
    prompt += "```\n\n";
    prompt +=
      "Available operations: add-node, remove-node, update-node-params, add-edge, remove-edge, update-settings\n\n";
    prompt +=
      'For remove-node and update-node-params, "path" should be the node ID.\n';
    prompt += 'For remove-edge, "path" should be the edge ID.\n';
    prompt +=
      'For add-edge, "value" should be the full edge object with id, source, sourcePort, target, targetPort.\n';
    prompt +=
      'For update-settings, "value" should be the settings fields to merge.\n\n';

    if (automation) {
      prompt += "The current automation definition is:\n\n";
      prompt += "```json\n" + JSON.stringify(automation, null, 2) + "\n```\n\n";
    }

    return prompt;
  }

  private parseResponse(content: string): {
    message: string;
    diffs?: AiDiff[];
  } {
    const jsonBlockRegex = /```json\s*\n([\s\S]*?)\n```/g;
    let message = content;
    const foundDiffs: AiDiff[] = [];

    let match: RegExpExecArray | null;
    while ((match = jsonBlockRegex.exec(content)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].op) {
          for (const item of parsed) {
            if (
              typeof item.op === "string" &&
              typeof item.path === "string" &&
              typeof item.description === "string"
            ) {
              foundDiffs.push(
                diffSchema.parse({
                  op: item.op as AiDiff["op"],
                  path: item.path,
                  value: item.value,
                  description: item.description,
                }) as AiDiff,
              );
            }
          }
        }
      } catch {
        // not valid JSON diffs, skip
      }
    }

    if (foundDiffs.length > 0) {
      const cleaned = content.replace(/```json\s*\n[\s\S]*?\n```/g, "").trim();
      message = cleaned || content;
    }

    return { message, diffs: foundDiffs.length > 0 ? foundDiffs : undefined };
  }

  static applyDiffs(
    definition: AutomationDefinition,
    diffs: AiDiff[],
  ): AutomationDefinition {
    diffs = z.array(diffSchema).min(1).max(200).parse(diffs) as AiDiff[];
    let nodes = structuredClone(definition.nodes);
    let edges = [...definition.edges];
    let settings = { ...definition.settings };

    for (const diff of diffs) {
      switch (diff.op) {
        case "add-node": {
          const node = diff.value as AutomationNode;
          if (!node?.id || !node.type) throw new Error("Invalid proposed node");
          nodes = [...nodes, node];
          break;
        }
        case "remove-node": {
          const nodeId = diff.path;
          const exists = nodes.some((n) => n.id === nodeId);
          if (!exists)
            throw new Error("Proposal references a missing graph element");
          nodes = nodes.filter((n) => n.id !== nodeId);
          edges = edges.filter(
            (e) => e.source !== nodeId && e.target !== nodeId,
          );
          break;
        }
        case "update-node-params": {
          const nodeId = diff.path;
          const nodeIdx = nodes.findIndex((n) => n.id === nodeId);
          if (nodeIdx === -1)
            throw new Error("Proposal references a missing node");
          const newParams = diff.value as Record<string, unknown>;
          nodes = nodes.map((n) =>
            n.id === nodeId
              ? { ...n, params: { ...n.params, ...newParams } }
              : n,
          );
          break;
        }
        case "add-edge": {
          const edge = diff.value as AutomationEdge;
          if (!edge?.id || !edge.source || !edge.target)
            throw new Error("Invalid proposed edge");
          edges = [...edges, edge];
          break;
        }
        case "remove-edge": {
          const edgeId = diff.path;
          const exists = edges.some((e) => e.id === edgeId);
          if (!exists)
            throw new Error("Proposal references a missing graph element");
          edges = edges.filter((e) => e.id !== edgeId);
          break;
        }
        case "update-settings": {
          const newSettings = diff.value as Partial<AutomationSettings>;
          settings = { ...settings, ...newSettings };
          break;
        }
      }
    }

    return validateDefinition({ ...definition, settings, nodes, edges });
  }
}

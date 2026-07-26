import type { NodeDefinition, RunContext, SimulationReport, NodeItem } from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";

interface LlmVisionParams {
  prompt: string;
  model: string;
  imagePath: string;
  apiKey: string;
}

const definition: NodeDefinition<LlmVisionParams> = {
  type: "vision.llm",
  version: 1,
  displayName: "LLM Vision",
  category: "vision",
  sideEffecting: true,
  inputs: [{ name: "in", type: "item" }],
  outputs: [{ name: "out", type: "item" }],
  paramsSchema: {
    prompt: { type: "string", description: "Prompt for the LLM" },
    model: { type: "string", default: "openai/gpt-4o", description: "OpenRouter model ID" },
    imagePath: { type: "string", description: "Path to image file" },
    apiKey: { type: "string", description: "OpenRouter API key" },
  },

  async run(ctx: RunContext<LlmVisionParams>): Promise<NodeItem[]> {
    const { prompt, imagePath } = ctx.params;
    const model = ctx.params.model ?? "openai/gpt-4o";
    const apiKey = ctx.params.apiKey;
    const effectiveApiKey = apiKey ?? ctx.secrets.OPENROUTER_API_KEY ?? "";

    if (!effectiveApiKey) {
      throw new Error("No API key provided. Set apiKey param or OPENROUTER_API_KEY secret.");
    }

    const file = Bun.file(imagePath);
    const exists = await file.exists();
    if (!exists) {
      throw new Error(`Image file not found: ${imagePath}`);
    }

    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    const body = {
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${base64}`,
              },
            },
          ],
        },
      ],
    };

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${effectiveApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[];
      model: string;
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };

    const content = data.choices?.[0]?.message?.content ?? "";
    const usage = data.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    return [
      {
        json: {
          response: content,
          model: data.model ?? model,
          usage,
        },
      },
    ];
  },

  async simulate(ctx: RunContext<LlmVisionParams>): Promise<SimulationReport> {
    return {
      description: "LLM Vision",
      wouldDo: `would send image to LLM model ${ctx.params.model}`,
    };
  },
};

nodeRegistry.register(definition);

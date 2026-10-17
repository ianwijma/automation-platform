import { imageBytes } from "../core/image-input.js";
import type {
  NodeDefinition,
  RunContext,
  SimulationReport,
  NodeItem,
} from "../core/node-contract.js";
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
    model: {
      type: "string",
      default: "openai/gpt-4o",
      description: "OpenRouter model ID",
    },
    imagePath: { type: "string", description: "Path to image file" },
  },

  async run(ctx: RunContext<LlmVisionParams>): Promise<NodeItem[]> {
    const { prompt, imagePath } = ctx.params;
    const model = ctx.params.model ?? "openai/gpt-4o";
    const effectiveApiKey =
      ctx.secrets.apiKey ?? ctx.secrets.OPENROUTER_API_KEY;
    if (!effectiveApiKey)
      throw new Error(
        "Configure the platform AI provider or bind an AI credential",
      );
    const image = await imageBytes(ctx, imagePath);
    const base64 = Buffer.from(image.data).toString("base64");

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
                url: `data:${image.mime};base64,${base64}`,
              },
            },
          ],
        },
      ],
    };

    const response = await fetch(
      `${ctx.secrets.endpoint ?? "https://openrouter.ai/api/v1"}/chat/completions`,
      {
        signal: ctx.signal,
        method: "POST",
        headers: {
          Authorization: `Bearer ${effectiveApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OpenRouter API error (${response.status}): ${errorText}`,
      );
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[];
      model: string;
      usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
    };

    const content = data.choices?.[0]?.message?.content ?? "";
    const usage = data.usage ?? {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };

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

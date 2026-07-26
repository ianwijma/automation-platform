import { randomUUID } from "node:crypto";

export interface MockOpenRouterConfig {
  port?: number;
  defaultModel?: string;
  apiKey?: string;
}

interface RecordedRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: unknown;
}

export class MockOpenRouter {
  private config: Required<MockOpenRouterConfig>;
  private server: ReturnType<typeof Bun.serve> | null = null;
  public requests: RecordedRequest[] = [];
  public chatResponse: string | null = null;
  public modelList: string[] = ["openai/gpt-4o-mini", "anthropic/claude-3.5-sonnet"];
  public shouldFail = false;
  public failStatus = 500;

  constructor(config?: MockOpenRouterConfig) {
    this.config = {
      port: config?.port ?? 0,
      defaultModel: config?.defaultModel ?? "openai/gpt-4o-mini",
      apiKey: config?.apiKey ?? "",
    };
  }

  async start(): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        this.server = Bun.serve({
          port: this.config.port,
          fetch: async (req) => this.handleRequest(req),
        });
        const url = `http://localhost:${this.server.port}`;
        resolve(url);
      } catch (err) {
        reject(err);
      }
    });
  }

  stop(): void {
    if (this.server) {
      this.server.stop();
      this.server = null;
    }
  }

  setChatResponse(response: string): void {
    this.chatResponse = response;
  }

  setModelList(models: string[]): void {
    this.modelList = models;
  }

  setFailure(status: number): void {
    this.shouldFail = true;
    this.failStatus = status;
  }

  reset(): void {
    this.requests = [];
    this.chatResponse = null;
    this.shouldFail = false;
    this.failStatus = 500;
    this.modelList = ["openai/gpt-4o-mini", "anthropic/claude-3.5-sonnet"];
  }

  private async handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key] = value;
    });

    let body: unknown;
    if (method === "POST") {
      try {
        body = await req.json();
      } catch {
        body = undefined;
      }
    }

    this.requests.push({ method, path, headers, body });

    if (this.config.apiKey) {
      const authHeader = headers["authorization"];
      if (authHeader !== `Bearer ${this.config.apiKey}`) {
        return Response.json({ error: { message: "Invalid API key", type: "auth_error" } }, { status: 401 });
      }
    }

    if (this.shouldFail) {
      return Response.json(
        { error: { message: "Mock error", type: "mock_error" } },
        { status: this.failStatus },
      );
    }

    if (method === "POST" && (path === "/chat/completions" || path === "/v1/chat/completions")) {
      const content = this.chatResponse ?? "Mock response";
      const completion = {
        id: `mock-${randomUUID()}`,
        object: "chat.completion",
        model: this.config.defaultModel,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content },
            finish_reason: "stop",
          },
        ],
      };
      return Response.json(completion);
    }

    if (method === "GET" && (path === "/models" || path === "/v1/models")) {
      return Response.json({
        data: this.modelList.map((id) => ({ id })),
      });
    }

    return Response.json({ error: { message: "Not found", type: "not_found" } }, { status: 404 });
  }
}

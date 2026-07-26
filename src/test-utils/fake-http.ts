interface RouteResponse {
  status: number;
  body: string;
  contentType?: string;
}

interface RecordedRequest {
  method: string;
  path: string;
  body?: string;
}

interface ChangingRoute {
  bodies: string[];
  index: number;
  base: RouteResponse;
}

export class FakeHttpService {
  private server: ReturnType<typeof Bun.serve> | null = null;
  public port: number = 0;
  public requests: RecordedRequest[] = [];

  private routes: Map<string, RouteResponse> = new Map();
  private changingRoutes: Map<string, ChangingRoute> = new Map();

  async start(): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        this.server = Bun.serve({
          port: 0,
          fetch: async (req) => this.handleRequest(req),
        });
        this.port = this.server.port ?? 0;
        resolve(`http://localhost:${this.port}`);
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

  setRoute(path: string, response: RouteResponse): this {
    this.routes.set(path, response);
    return this;
  }

  setChangingRoute(path: string, bodies: string[]): this {
    const existing = this.routes.get(path);
    const base: RouteResponse = existing ?? { status: 200, body: "", contentType: "application/json" };
    this.changingRoutes.set(path, { bodies, index: 0, base });
    return this;
  }

  reset(): void {
    this.requests = [];
    this.routes.clear();
    this.changingRoutes.clear();
  }

  private async handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname + url.search;
    const method = req.method;

    let body: string | undefined;
    if (method === "POST" || method === "PUT" || method === "PATCH") {
      try {
        body = await req.text();
      } catch {
        body = undefined;
      }
    }

    this.requests.push({ method, path: url.pathname, body });

    const changing = this.changingRoutes.get(url.pathname);
    if (changing) {
      const currentBody = changing.bodies[changing.index % changing.bodies.length];
      changing.index++;
      const contentType = changing.base.contentType ?? "application/json";
      return new Response(currentBody, {
        status: changing.base.status,
        headers: { "Content-Type": contentType },
      });
    }

    const route = this.routes.get(url.pathname);
    if (route) {
      const contentType = route.contentType ?? "application/json";
      return new Response(route.body, {
        status: route.status,
        headers: { "Content-Type": contentType },
      });
    }

    return new Response("Not Found", { status: 404 });
  }
}

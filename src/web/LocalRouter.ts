// Just enough of an Express Router for the controllers to register on: the web version answers the same
// /api paths inside the browser, so services and controllers are shared with the server unchanged.
type Next = () => void;
type Handler = (req: LocalRequest, res: LocalResponse, next: Next) => unknown;

type Route = { method: string; pattern: RegExp; keys: string[]; handlers: Handler[] };

export type LocalRequest = {
  method: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string>;
  body: Record<string, unknown>;
  file?: { buffer: Uint8Array };
  get(name: string): string | undefined;
};

export class LocalResponse {
  statusCode = 200;
  headersSent = false;
  body: unknown = undefined;
  readonly locals: Record<string, unknown> = {};

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  json(body: unknown): this {
    this.body = body;
    this.headersSent = true;
    return this;
  }

  setHeader(): this {
    return this;
  }
}

export class LocalRouter {
  readonly #routes: Route[] = [];

  get = (path: string, ...handlers: Handler[]) => this.#add("GET", path, handlers);
  post = (path: string, ...handlers: Handler[]) => this.#add("POST", path, handlers);
  put = (path: string, ...handlers: Handler[]) => this.#add("PUT", path, handlers);
  patch = (path: string, ...handlers: Handler[]) => this.#add("PATCH", path, handlers);
  delete = (path: string, ...handlers: Handler[]) => this.#add("DELETE", path, handlers);

  async dispatch(request: Omit<LocalRequest, "params" | "get">): Promise<LocalResponse> {
    const res = new LocalResponse();
    for (const route of this.#routes) {
      if (route.method !== request.method) continue;
      const match = route.pattern.exec(request.path);
      if (!match) continue;
      const params = Object.fromEntries(route.keys.map((key, i) => [key, decodeURIComponent(match[i + 1])]));
      const req: LocalRequest = { ...request, params, get: () => undefined };
      for (const handler of route.handlers) {
        let advanced = false;
        await handler(req, res, () => {
          advanced = true;
        });
        if (!advanced) break;
      }
      return res;
    }
    return res.status(404).json({ error: "Ta funkcja działa tylko w aplikacji na komputer." });
  }

  #add(method: string, path: string, handlers: Handler[]): this {
    const keys: string[] = [];
    const source = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/:(\w+)/g, (_, key: string) => {
      keys.push(key);
      return "([^/]+)";
    });
    this.#routes.push({ method, pattern: new RegExp(`^${source}/?$`), keys, handlers });
    return this;
  }
}

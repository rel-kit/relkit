import type { Hono } from "hono";

export interface HttpAuthInvocation {
  readonly getSession: () => Promise<unknown | null>;
}

export interface HttpAuthRuntime {
  readonly protected: readonly string[];
  readonly publicPaths: readonly string[];
  readonly contextFor: (request: Request) => HttpAuthInvocation;
  readonly protects: (path: string) => boolean;
}

export interface CreateHttpAuthRuntimeOptions {
  readonly protected: readonly string[];
  readonly publicPaths: readonly string[];
  readonly getSession: (headers: Headers) => Promise<unknown | null>;
}

export function createHttpAuthRuntime(options: CreateHttpAuthRuntimeOptions): HttpAuthRuntime {
  const contexts = new WeakMap<Request, HttpAuthInvocation>();
  return Object.freeze({
    protected: Object.freeze([...options.protected]),
    publicPaths: Object.freeze([...options.publicPaths]),
    contextFor(request: Request): HttpAuthInvocation {
      const existing = contexts.get(request);
      if (existing !== undefined) return existing;
      const headers = new Headers(request.headers);
      let session: Promise<unknown | null> | undefined;
      const context = Object.freeze({
        getSession: () => (session ??= Promise.resolve(options.getSession(headers))),
      });
      contexts.set(request, context);
      return context;
    },
    protects: (path: string) => options.protected.some((pattern) => matches(pattern, path)),
  });
}

export function registerAuthMiddleware(app: Hono, auth: HttpAuthRuntime | undefined): void {
  if (auth === undefined) return;
  app.use("*", async (context, next) => {
    const path = context.req.path;
    if (
      auth.publicPaths.some((pattern) => matches(pattern, path)) ||
      !auth.protected.some((pattern) => matches(pattern, path))
    ) {
      await next();
      return;
    }
    const session = await auth.contextFor(context.req.raw).getSession();
    if (session === null) {
      return context.json(
        { error: { id: "UNAUTHORIZED", message: "Authentication required" } },
        401,
      );
    }
    await next();
  });
}

function matches(pattern: string, path: string): boolean {
  if (pattern.endsWith("/*")) {
    return path === pattern.slice(0, -2) || path.startsWith(pattern.slice(0, -1));
  }
  const wildcard = pattern.indexOf("*");
  if (wildcard >= 0) {
    const base = pattern.slice(0, wildcard).replace(/\/$/, "");
    return (pattern.endsWith("?") && path === base) || path.startsWith(`${base}/`);
  }
  const parameter = pattern.indexOf("/:");
  if (parameter >= 0) return path.startsWith(`${pattern.slice(0, parameter)}/`);
  return path === pattern;
}

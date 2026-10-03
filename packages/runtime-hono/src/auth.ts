import { Context, Effect, Layer } from "effect";
import type { Hono } from "hono";
import type {
  CreateHttpAuthRuntimeOptions,
  HttpAuthInvocation,
  HttpAuthRuntime,
} from "./auth.types.js";
import { httpBoundary, HttpBoundaryError, observeHttp, runHttp } from "./http-effect.js";
export type {
  CreateHttpAuthRuntimeOptions,
  HttpAuthInvocation,
  HttpAuthRuntime,
} from "./auth.types.js";

/** One request's lazily memoized authentication session.
 * @see tests/request-services.test.ts for checked concurrent lookup and explicit refresh.
 */
export class HttpSession extends Context.Service<
  HttpSession,
  {
    readonly get: (fresh: boolean) => Effect.Effect<unknown | null, HttpBoundaryError>;
  }
>()("@relkit/runtime-hono/HttpSession") {}

/** Captures request headers once and shares each lookup among concurrent readers.
 * @param headers - Native or protocol headers available to this request.
 * @param lookup - Foreign session lookup callback retained by the request-owned cache.
 * @returns A layer sharing one lazy session lookup until an explicit refresh.
 */
export function httpSessionLayer(
  headers: Headers,
  lookup: CreateHttpAuthRuntimeOptions["getSession"],
) {
  const load = httpBoundary("auth.session", () => lookup(headers));
  // Memo allocation is synchronous; constructing the layer does not call user code.
  let cached = Effect.runSync(Effect.cached(load));
  return Layer.succeed(HttpSession, {
    get: Effect.fn("HttpSession.get")((fresh: boolean) =>
      observeHttp(
        "auth.session",
        Effect.gen(function* () {
          if (fresh) cached = yield* Effect.cached(load);
          return yield* cached;
        }),
      ),
    ),
  });
}

/** Creates request-scoped authentication contexts and shared session lookup state.
 * @param options - Application dependencies and configuration for this domain.
 * @returns A frozen auth runtime with path policy and stable per-request session contexts.
 */
export function createHttpAuthRuntime(options: CreateHttpAuthRuntimeOptions): HttpAuthRuntime {
  const contexts = new WeakMap<Request, HttpAuthInvocation>();
  return Object.freeze({
    protected: Object.freeze([...options.protected]),
    publicPaths: Object.freeze([...options.publicPaths]),
    /** Returns the stable authentication context owned by one native request.
     * @param request - Native request whose headers, body and cancellation signal define this operation.
     * @returns The existing request context or a new context sharing a lazily cached session lookup.
     */
    contextFor(request: Request): HttpAuthInvocation {
      const existing = contexts.get(request);
      if (existing !== undefined) return existing;
      const headers = new Headers(request.headers);
      const layer = httpSessionLayer(headers, options.getSession);
      const context = Object.freeze({
        getSession: (read: { readonly fresh?: boolean } = {}) => {
          return runHttp(
            Effect.gen(function* () {
              return yield* (yield* HttpSession).get(read.fresh === true);
            }).pipe(Effect.provide(layer)),
          );
        },
      });
      contexts.set(request, context);
      return context;
    },
    protects: (path: string) => options.protected.some((pattern) => matches(pattern, path)),
  });
}

/** Registers configured authentication middleware on its declared paths.
 * @param app - Hono application receiving the configured endpoints or middleware.
 * @param auth - Optional request authentication context or middleware configuration.
 * @returns Nothing; the declared authentication routes are installed.
 */
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

/** Checks whether an authentication middleware pattern applies to the request path.
 * @param pattern - Declared middleware path pattern.
 * @param path - Ordered validation path or confined resource path.
 * @returns Whether the value satisfies the required public contract.
 */
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

import { Context, Effect, Layer } from "effect";
import type { Context as HonoContext, Hono } from "hono";
import type { HttpTriggerRegistration } from "../graph/index.js";
import type {
  CreateHttpAuthRuntimeOptions,
  HttpAuthInvocation,
  HttpAuthRuntime,
} from "./auth.types.js";
import { httpBoundary, HttpBoundaryError, observeHttp, runHttp } from "./http-effect.js";
import { contextProblem } from "./problem-details.js";
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
 * @returns A frozen auth runtime with stable per-request session contexts.
 */
export function createHttpAuthRuntime(options: CreateHttpAuthRuntimeOptions): HttpAuthRuntime {
  const contexts = new WeakMap<Request, HttpAuthInvocation>();
  return Object.freeze({
    ...(options.resolveAccess === undefined ? {} : { resolveAccess: options.resolveAccess }),
    ...(options.getOpenApiDocument === undefined
      ? {}
      : {
          getOpenApiDocument: options.getOpenApiDocument,
        }),
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
  });
}

/** Rejects a request without a session; middleware and handlers share its memoized lookup.
 * @param context - Request context.
 * @param auth - Auth runtime; without one, no request can have a session.
 * @returns A 401 problem, or undefined when the request has a session.
 */
export async function requireSession(
  context: HonoContext,
  auth: HttpAuthRuntime | undefined,
): Promise<Response | undefined> {
  const session = auth === undefined ? null : await auth.contextFor(context.req.raw).getSession();
  if (session !== null && session !== undefined) return undefined;
  return contextProblem(context, {
    status: 401,
    code: "unauthenticated",
    detail: "This route requires a signed-in session.",
  });
}

/** Checks the session of each route that sets `auth: "required"`, before its middleware.
 * @param app - Application receiving the checks ahead of route middleware and handlers.
 * @param triggers - Compiled routes.
 * @param auth - Auth runtime; routes that require a session answer 401 without one.
 * @returns Nothing; one check is registered per protected route path and method.
 */
export function registerRouteAuth(
  app: Hono,
  triggers: readonly HttpTriggerRegistration[],
  auth: HttpAuthRuntime | undefined,
): void {
  for (const trigger of triggers) {
    if (trigger.config.auth?.kind !== "required") continue;
    const method = trigger.config.method === "HEAD" ? "GET" : trigger.config.method;
    for (const path of trigger.config.runtimePaths ?? [trigger.config.path])
      app.on(method, path, async (context, next) => {
        if (trigger.config.method === "HEAD" && context.req.method !== "HEAD") return next();
        return (await requireSession(context, auth)) ?? next();
      });
  }
}

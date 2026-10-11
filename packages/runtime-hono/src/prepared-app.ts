/**
 * Exposes the prepared-only Bun HTTP boundary. REST uses the canonical eager
 * policy directly; optional transport paths select a generation-owned complete
 * application before middleware runs, avoiding duplicate auth and request logs.
 * The existing server host must own close() as an application resource.
 */
import { Context, Effect, Layer, ManagedRuntime, Scope } from "effect";
import { currentNativeEffectContext } from "@relkit/runtime-effect";
import type { CreateAppOptions } from "./create-app.types.js";
import { currentHttpContext } from "./http-logging.js";
import { PreparedTransports, PreparedTransportLoaderLive } from "./prepared-transports.service.js";
import type {
  PreparedHttpApplication,
  PreparedAppInitializer,
} from "./prepared-transports.types.js";
export { createHttpAuthRuntime } from "./auth.js";
export { createHttpSpanRuntime, instrumentHttpRequest } from "./http-span.js";

/** Acquires a prepared generation at the native server-host boundary.
 * @param options - Checked graph/cohort and current environment dependencies.
 * @param initialize - Optional endpoint installation, owned by deferred generation loading.
 * @returns REST application, per-request Fetch dispatch, and joined disposal.
 * @remarks The caller owns close even when HTTP binding fails after acquisition.
 */
export async function createPreparedApp(
  options: CreateAppOptions,
  initialize?: PreparedAppInitializer,
): Promise<PreparedHttpApplication> {
  const inherited = (currentNativeEffectContext() ?? Context.empty()).pipe(
    Context.omit(Scope.Scope),
  );
  const runtime = ManagedRuntime.make(
    Layer.effect(PreparedTransports, PreparedTransports.make(options, initialize)).pipe(
      Layer.provide(PreparedTransportLoaderLive),
      Layer.provide(Layer.succeedContext(inherited)),
    ),
  );
  try {
    const service = await runtime.runPromise(PreparedTransports);
    return {
      app: service.app,
      fetch: (request, server) => {
        if (!requiresDeferredTransport(new URL(request.url).pathname)) {
          return service.app.fetch(request, server);
        }
        return runtime
          .runPromise(service.load().pipe(Effect.provide(currentHttpContext())), {
            signal: request.signal,
          })
          .then((app) => app.fetch(request, server));
      },
      close: () => runtime.dispose(),
    };
  } catch (cause) {
    await runtime.dispose();
    throw cause;
  }
}

/** Selects the canonical full app before any request middleware executes.
 * @param path - Decoded URL pathname, preserving Hono's existing case sensitivity.
 * @returns Whether this path can be handled by an optional transport.
 */
export function requiresDeferredTransport(path: string): boolean {
  if (path === "/_relkit/v1/graph" || path.startsWith("/_relkit/v1/health/")) return false;
  return (
    path === "/rpc" ||
    path.startsWith("/rpc/") ||
    path === "/mcp" ||
    path.startsWith("/_relkit/v1/")
  );
}

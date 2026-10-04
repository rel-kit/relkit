import { AsyncLocalStorage } from "node:async_hooks";
import type { TestHttpApplication, TestHttpInput } from "./http.js";
import type { TestRuntime } from "./runtime.js";
import type { TestRoute } from "./application-routes.js";
import type { TestApplicationServices } from "./application-services.js";
import { handleTestRequest } from "./application-http.js";

/**
 * Binds HTTP admission and request-local authentication to an acquired runtime.
 * @param routes Compiled routes, including the optional authentication mount.
 * @param applicationRuntime Runtime bound to this application's realtime providers.
 * @param services Database and authentication resources already acquired by the owner.
 * @param context Context patch used by the runtime's lazy context factory.
 * @returns The native in-memory HTTP boundary owned by the application Layer.
 */
export function createApplicationRequest(
  routes: readonly TestRoute[],
  applicationRuntime: TestRuntime,
  services: TestApplicationServices,
  context: Record<string, unknown>,
): TestHttpApplication {
  const requests = new AsyncLocalStorage<Request>();
  Object.assign(context, services.context, {
    auth: Object.freeze({
      getSession: () => {
        const request = requests.getStore();
        return request === undefined || services.auth === undefined
          ? Promise.resolve(null)
          : services.auth.contextFor(request).getSession();
      },
    }),
  });
  return {
    request: async (input: TestHttpInput, init: RequestInit | undefined) => {
      const request =
        input instanceof Request
          ? init === undefined
            ? input
            : new Request(input, init)
          : new Request(new URL(input.toString(), "http://relkit.test").toString(), init);
      return requests.run(request, async () => {
        const path = new URL(request.url).pathname;
        if (isAuthEndpoint(routes, path) && services.authHandler !== undefined) {
          return services.authHandler(request);
        }
        if (!isAuthEndpoint(routes, path) && services.auth?.protects(path)) {
          const session = await services.auth.contextFor(request).getSession();
          if (session === null) {
            return Response.json(
              { error: { id: "UNAUTHORIZED", message: "Authentication required" } },
              { status: 401 },
            );
          }
        }
        return handleTestRequest(routes, applicationRuntime, request);
      });
    },
  };
}

/**
 * Matches the configured authentication catch-all mount.
 * @param routes - Loaded native filesystem routes.
 * @param path - Native module path or route path being resolved.
 * @returns True for the mount base or a path beneath it.
 */
function isAuthEndpoint(
  routes: readonly { readonly method: string; readonly path: string; readonly auth?: unknown }[],
  path: string,
): boolean {
  const mount = routes.find((route) => route.method === "ALL" && route.auth !== undefined);
  if (mount === undefined) return false;
  const base = mount.path.replace(/\/\*[^/]+\??$/, "");
  return path === base || path.startsWith(`${base}/`);
}

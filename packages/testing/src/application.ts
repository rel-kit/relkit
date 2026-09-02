import {
  createTestHttpClient,
  createTestObservability,
  type TestHttpClient,
  type TestHttpInput,
  type TestObservability,
} from "./http.js";
import {
  createTestRuntime,
  type TestClock,
  type TestRuntime,
  type TestRuntimeOptions,
} from "./runtime.js";
import { type TestFakes } from "./fakes.js";
import { loadTestRoutes } from "./application-routes.js";
import { handleTestRequest } from "./application-http.js";
import { activateTestServices } from "./application-services.js";
import { loadTestApplicationArtifacts } from "./application-registry.js";
import { activateTestProviders } from "./provider-replacements.js";

export type TestApplicationOptions = Omit<TestRuntimeOptions, "app"> & {
  readonly projectRoot?: string;
  readonly bindingValues?: Readonly<Record<string, JsonValue>>;
};

export interface TestApplication {
  readonly runtime: TestRuntime;
  readonly http: TestHttpClient;
  readonly clock: TestClock;
  readonly fakes: TestFakes;
  readonly observability: TestObservability;
  readonly close: () => Promise<void>;
}

/**
 * Creates an in-process application harness with HTTP, fakes, clock, and observability controls.
 *
 * @example
 * ```ts
 * import { createTestApplication } from "@relkit/testing"
 *
 * if (typeof Bun !== "undefined") {
 *   const application = await createTestApplication({ env: {} }, { projectRoot: "examples/commerce" })
 *   await application.close()
 * }
 * ```
 * @category Testing
 * @since 0.1.0
 */
export async function createTestApplication(
  app: { readonly env: object },
  options: TestApplicationOptions = {},
): Promise<TestApplication> {
  const { projectRoot: configuredRoot, bindingValues, ...runtimeOptions } = options;
  const projectRoot = configuredRoot ?? process.cwd();
  const artifacts = await loadTestApplicationArtifacts(projectRoot);
  const registry = runtimeOptions.registry ?? artifacts?.registry;
  const routes = await loadTestRoutes(projectRoot);
  const context: Record<string, unknown> = {};
  const runtime = createTestRuntime({
    app: app as NonNullable<TestRuntimeOptions["app"]>,
    ...runtimeOptions,
    ...(registry === undefined ? {} : { registry }),
    context,
  });
  let providers;
  try {
    providers = await activateTestProviders(
      artifacts,
      runtime.providers,
      bindingValues,
      runtime.fakes,
    );
  } catch (error) {
    await runtime.close({ failed: true });
    throw error;
  }
  const services = await activateTestServices(projectRoot, runtime.env, routes);
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
  const application = {
    request: async (input: TestHttpInput, init: RequestInit | undefined) => {
      const request =
        input instanceof Request
          ? init === undefined
            ? input
            : new Request(input, init)
          : new Request(new URL(input.toString(), "http://relkit.test").toString(), init);
      return requests.run(request, async () => {
        const path = new URL(request.url).pathname;
        if (!isAuthEndpoint(routes, path) && services.auth?.protects(path)) {
          const session = await services.auth.contextFor(request).getSession();
          if (session === null) {
            return Response.json(
              { error: { id: "UNAUTHORIZED", message: "Authentication required" } },
              { status: 401 },
            );
          }
        }
        return handleTestRequest(routes, runtime, request);
      });
    },
  };
  const http = createTestHttpClient(application);
  const observability = createTestObservability();
  let closing: Promise<void> | undefined;
  const close = (): Promise<void> =>
    (closing ??= (async () => {
      const failures: unknown[] = [];
      for (const cleanup of [
        () => http.close(),
        () => runtime.close(),
        () => providers?.release(),
        () => services.close(),
      ]) {
        try {
          await cleanup();
        } catch (error) {
          failures.push(error);
        }
      }
      if (failures.length > 0)
        throw new AggregateError(failures, "Test application cleanup failed");
    })());
  return Object.freeze({
    runtime,
    http,
    clock: runtime.clock,
    fakes: runtime.fakes,
    observability,
    close,
  });
}

function isAuthEndpoint(
  routes: readonly { readonly method: string; readonly path: string; readonly auth?: unknown }[],
  path: string,
): boolean {
  const mount = routes.find((route) => route.method === "ALL" && route.auth !== undefined);
  if (mount === undefined) return false;
  const base = mount.path.replace(/\/\*[^/]+\??$/, "");
  return path === base || path.startsWith(`${base}/`);
}
import { AsyncLocalStorage } from "node:async_hooks";
import type { JsonValue } from "@relkit/contracts";

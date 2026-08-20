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

export type TestApplicationOptions = Omit<TestRuntimeOptions, "app"> & {
  readonly projectRoot?: string;
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
 * import { createTestApplication } from "@zsys/testing"
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
  const projectRoot = options.projectRoot ?? process.cwd();
  const routes = await loadTestRoutes(projectRoot);
  const runtime = createTestRuntime({
    app: app as NonNullable<TestRuntimeOptions["app"]>,
    ...options,
  });
  const application = {
    request: async (input: TestHttpInput, init: RequestInit | undefined) =>
      handleTestRequest(
        routes,
        runtime,
        input instanceof Request
          ? init === undefined
            ? input
            : new Request(input, init)
          : new Request(new URL(input.toString(), "http://zsys.test").toString(), init),
      ),
  };
  const http = createTestHttpClient(application);
  const observability = createTestObservability();
  let closing: Promise<void> | undefined;
  const close = (): Promise<void> =>
    (closing ??= (async () => {
      await http.close();
      await runtime.close();
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

import { Context, Effect, Exit, Layer, ManagedRuntime } from "effect";
import { observeExecution, runExecutionPromise } from "@relkit/contracts/operation";
import { createTestHttpClient, createTestObservability } from "./http.js";
import { createTestRuntime, type TestRuntimeOptions } from "./runtime.js";
import { loadTestRoutes } from "./application-routes.js";
import { activateTestServices } from "./application-services.js";
import { loadTestApplicationArtifacts } from "./application-registry.js";
import { activateTestProviders } from "./provider-replacements.js";
import { bindTestRealtime } from "./application-realtime.js";
import { createApplicationRequest } from "./application-request.js";
import { resolveRuntimeEnv, validateRuntimeTimeout } from "./runtime-options.js";
import { copyTestProviderReplacements } from "./provider-replacements.js";
import { disposeTestingOwner, testingLoggerLayer } from "./testing-owner.js";
import type {
  ApplicationHarness,
  ApplicationPlatform,
  TestApplication,
  TestApplicationOptions,
} from "./application.types.js";
export type { TestApplication, TestApplicationOptions } from "./application.types.js";

/** Native application dependencies; tests substitute the same contract before acquisition. */
export class TestApplicationPlatform extends Context.Service<
  TestApplicationPlatform,
  ApplicationPlatform
>()("relkit/testing/ApplicationPlatform") {}

/** Resources and release failures owned by one application Layer scope. */
export class TestApplicationHarness extends Context.Service<
  TestApplicationHarness,
  ApplicationHarness
>()("relkit/testing/ApplicationHarness") {}

export const TestApplicationPlatformLive = Layer.succeed(
  TestApplicationPlatform,
  TestApplicationPlatform.of({
    artifacts: loadTestApplicationArtifacts,
    routes: loadTestRoutes,
    providers: activateTestProviders,
    services: activateTestServices,
  }),
);

/**
 * Creates an application owner with HTTP, deterministic runtime and provider services.
 * @param app Application environment declarations.
 * @param options Explicit environment, generated project and provider overrides.
 * @returns The ready harness; close releases resources in reverse acquisition order.
 * @example
 * ```ts
 * import { defineEnv } from "@relkit/app/config";
 * import { createTestApplication } from "@relkit/testing";
 *
 * export async function applicationExample(projectRoot: string): Promise<void> {
 *   const app = await createTestApplication({ env: defineEnv({}) }, { projectRoot });
 *   try {
 *     await app.http.get("/");
 *   } finally {
 *     await app.close();
 *   }
 * }
 * ```
 * @see tests/fixtures/checked-examples.ts applicationExample for the typechecked pattern.
 * @category Testing
 * @since 0.1.0
 */
export async function createTestApplication(
  app: { readonly env: object },
  options: TestApplicationOptions = {},
): Promise<TestApplication> {
  const owner = ManagedRuntime.make(
    testApplicationLayer(app, options).pipe(
      Layer.provide(TestApplicationPlatformLive),
      Layer.provideMerge(testingLoggerLayer(options.logger)),
    ),
  );
  try {
    const harness = await runExecutionPromise(owner, TestApplicationHarness);
    let closing: Promise<void> | undefined;
    return Object.freeze({
      ...harness.value,
      close: () =>
        (closing ??= (async () => {
          await disposeTestingOwner(owner);
          if (harness.cleanupFailures.length > 0)
            throw new AggregateError(harness.cleanupFailures, "Test application cleanup failed");
        })()),
    });
  } catch (error) {
    await disposeTestingOwner(owner);
    throw error;
  }
}

/**
 * Acquires runtime, providers, database/auth and HTTP in one scoped domain workflow.
 * @param app Environment declaration passed to the synchronous runtime factory.
 * @param options Explicit test resource configuration.
 * @returns A Layer requiring replaceable native application dependencies.
 * @remarks Each successful acquisition registers release; failures clean the prefix.
 */
export function testApplicationLayer(
  app: { readonly env: object },
  options: TestApplicationOptions = {},
) {
  return Layer.effect(
    TestApplicationHarness,
    observeExecution(
      "testing",
      "application.acquire",
      Effect.fn("Testing.application.acquire")(function* () {
        const platform = yield* TestApplicationPlatform;
        const {
          projectRoot: configuredRoot,
          bindingValues,
          resourceProviders,
          ...runtimeOptions
        } = options;
        const root = configuredRoot ?? process.cwd();
        yield* Effect.try({
          try: () => {
            resolveRuntimeEnv({
              app: app as NonNullable<TestRuntimeOptions["app"]>,
              ...runtimeOptions,
            });
            validateRuntimeTimeout(runtimeOptions.closeTimeoutMs ?? 1_000);
            if (!Number.isFinite(runtimeOptions.startTimeMs ?? 0))
              throw new TypeError("startTimeMs must be finite");
            copyTestProviderReplacements(runtimeOptions.providers);
          },
          catch: (cause) => cause,
        });
        const artifacts = yield* Effect.tryPromise({
          try: () => platform.artifacts(root),
          catch: (cause) => cause,
        });
        const routes = yield* Effect.tryPromise({
          try: () => platform.routes(root),
          catch: (cause) => cause,
        });
        const registry = runtimeOptions.registry ?? artifacts?.registry;
        const context: Record<string, unknown> = {};
        const cleanupFailures: unknown[] = [];
        const runtime = yield* Effect.acquireRelease(
          Effect.try({
            try: () =>
              createTestRuntime({
                app: app as NonNullable<TestRuntimeOptions["app"]>,
                ...runtimeOptions,
                ...(registry === undefined ? {} : { registry }),
                context,
              }),
            catch: (cause) => cause,
          }),
          (value, exit) =>
            cleanup(() => value.close({ failed: Exit.isFailure(exit) }), cleanupFailures),
        );
        const providers = yield* Effect.acquireRelease(
          Effect.tryPromise({
            try: () =>
              platform.providers(
                artifacts,
                runtime.providers,
                bindingValues,
                runtime.fakes,
                resourceProviders === "fake",
              ),
            catch: (cause) => cause,
          }),
          (value) => cleanup(() => value?.release(), cleanupFailures),
        );
        const services = yield* Effect.acquireRelease(
          Effect.tryPromise({
            try: () => platform.services(root, runtime.env, routes),
            catch: (cause) => cause,
          }),
          (value) => cleanup(() => value.close(), cleanupFailures),
        );
        const applicationRuntime = bindTestRealtime(
          runtime,
          artifacts,
          providers,
          runtimeOptions.environment ?? "test",
        );
        const http = yield* Effect.acquireRelease(
          Effect.sync(() =>
            createTestHttpClient(
              createApplicationRequest(routes, applicationRuntime, services, context),
              { ...(options.logger === undefined ? {} : { logger: options.logger }) },
            ),
          ),
          (value) => cleanup(() => value.close(), cleanupFailures),
        );
        return TestApplicationHarness.of({
          value: Object.freeze({
            runtime: applicationRuntime,
            http,
            clock: runtime.clock,
            fakes: runtime.fakes,
            observability: createTestObservability(),
          }),
          cleanupFailures,
        });
      })(),
    ),
  );
}

/**
 * Records cleanup failures while preserving sibling release.
 * @param release Native release operation registered after acquisition.
 * @param failures Owner-local collection reported after complete shutdown.
 * @returns An infallible finalizer that attempts this release.
 */
function cleanup(
  release: () => Promise<unknown> | undefined,
  failures: unknown[],
): Effect.Effect<void> {
  return Effect.tryPromise({
    try: async () => {
      await release();
    },
    catch: (cause) => cause,
  }).pipe(
    Effect.catch((cause) =>
      Effect.sync(() => {
        failures.push(cause);
      }),
    ),
  );
}

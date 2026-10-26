/** Acquires the general runtime and explicitly selected application services in one scope. */
import { Effect, Exit } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { createTestHttpClient, createTestObservability } from "./http.js";
import { createTestRuntime, type TestRuntimeOptions } from "./runtime.js";
import { bindTestRealtime } from "./application-realtime.js";
import { createApplicationRequest } from "./application-request.js";
import { resolveRuntimeEnv, validateRuntimeTimeout } from "./runtime-options.js";
import { copyTestProviderReplacements } from "./provider-replacements.js";
import { TestApplicationHarness, TestApplicationPlatform } from "./application-platform.js";
import { cleanup } from "./application-cleanup.js";
import type { TestApplicationOptions } from "./application.types.js";

/** Validates configuration before loading application artifacts or acquiring resources. */
function validate(app: { readonly env: object }, options: TestRuntimeOptions): void {
  resolveRuntimeEnv({ app: app as NonNullable<TestRuntimeOptions["app"]>, ...options });
  validateRuntimeTimeout(options.closeTimeoutMs ?? 1_000);
  if (!Number.isFinite(options.startTimeMs ?? 0)) throw new TypeError("startTimeMs must be finite");
  copyTestProviderReplacements(options.providers);
}

/** Loads the declaration graph before native service acquisition. */
const load = Effect.fn("Testing.application.load")(function* (
  app: { readonly env: object },
  options: TestApplicationOptions,
) {
  const platform = yield* TestApplicationPlatform;
  const { projectRoot, bindingValues, resourceProviders, services, ...runtimeOptions } = options;
  yield* Effect.try({ try: () => validate(app, runtimeOptions), catch: (cause) => cause });
  const root = projectRoot ?? process.cwd();
  const artifacts = yield* Effect.tryPromise({
    try: () => platform.artifacts(root),
    catch: (cause) => cause,
  });
  const routes = yield* Effect.tryPromise({
    try: () => platform.routes(root),
    catch: (cause) => cause,
  });
  return {
    platform,
    root,
    artifacts,
    routes,
    bindingValues,
    resourceProviders,
    services,
    runtimeOptions,
  };
});

/** Acquires runtime/provider resources, registering each release immediately. */
const acquireRuntime = Effect.fn("Testing.application.runtime")(function* (
  app: { readonly env: object },
  loaded: Effect.Success<ReturnType<typeof load>>,
  context: Record<string, unknown>,
  failures: unknown[],
) {
  const { artifacts, runtimeOptions, platform, bindingValues, resourceProviders } = loaded;
  const registry = runtimeOptions.registry ?? artifacts?.registry;
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
      cleanup(() => value.close({ failed: Exit.isFailure(exit) }), failures, Exit.isFailure(exit)),
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
    (value, exit) => cleanup(() => value?.release(), failures, Exit.isFailure(exit)),
  );
  return bindTestRealtime(runtime, artifacts, providers, runtimeOptions.environment ?? "test");
});

/** Native application work shares one scope and reverse-order cleanup policy. */
export const acquireApplication = Effect.fn("Testing.application.acquire")(
  function* (app: { readonly env: object }, options: TestApplicationOptions) {
    const loaded = yield* load(app, options);
    const context: Record<string, unknown> = {};
    const cleanupFailures: unknown[] = [];
    const runtime = yield* acquireRuntime(app, loaded, context, cleanupFailures);
    const services = yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () =>
          (loaded.services ?? loaded.platform.services)(loaded.root, runtime.env, loaded.routes),
        catch: (cause) => cause,
      }),
      (value, exit) => cleanup(() => value.close(), cleanupFailures, Exit.isFailure(exit)),
    );
    const http = yield* Effect.acquireRelease(
      Effect.sync(() =>
        createTestHttpClient(createApplicationRequest(loaded.routes, runtime, services, context), {
          ...(options.logger === undefined ? {} : { logger: options.logger }),
        }),
      ),
      (value, exit) => cleanup(() => value.close(), cleanupFailures, Exit.isFailure(exit)),
    );
    return TestApplicationHarness.of({
      value: Object.freeze({
        runtime,
        http,
        clock: runtime.clock,
        fakes: runtime.fakes,
        observability: createTestObservability(),
      }),
      cleanupFailures,
    });
  },
  (effect) => observeExecution("testing", "application.acquire", effect),
);

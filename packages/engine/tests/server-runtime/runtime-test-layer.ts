/** Verifies engine-owned generation lifetime, preserving the existing lifecycle contract. */
import { Context, Effect, Layer, Ref } from "effect";
import { RuntimeEnvironment } from "../../src/server-runtime/runtime-environment.js";
import type { ServerRuntimeFailure } from "../../src/server-runtime/server-runtime.schemas.js";
import type { RuntimeEnvironmentTestOperations } from "./runtime-test-layer.types.js";

/** Deterministic report inspection; application logic only requires RuntimeEnvironment. */
export class RuntimeEnvironmentTest extends Context.Service<
  RuntimeEnvironmentTest,
  RuntimeEnvironmentTestOperations
>()("@relkit/cli/ServerRuntime/TestEnvironment", {
  make: Effect.gen(function* () {
    const reports = yield* Ref.make<ReadonlyArray<ServerRuntimeFailure>>([]);
    const controller = yield* Effect.acquireRelease(
      Effect.sync(() => new AbortController()),
      (value) => Effect.sync(() => value.abort()),
    );
    return {
      controller,
      initialReady: {
        provider: false,
        database: true,
        auth: true,
        nativeWorker: true,
        server: false,
      },
      drainTimeoutMs: 10,
      telemetryTimeoutMs: 5,
      providerDelayMs: 20,
      workerIntervalMs: 10,
      report: (failure) => Ref.update(reports, (current) => [...current, failure]),
      reports: () => Ref.get(reports),
    } satisfies RuntimeEnvironmentTestOperations;
  }),
}) {}

/** Configured fakes use the caller's TestClock and own one fresh abort controller. */
export const runtimeTestLayer = Layer.effectContext(
  RuntimeEnvironmentTest.make.pipe(
    Effect.map((service) =>
      Context.make(RuntimeEnvironment, service).pipe(Context.add(RuntimeEnvironmentTest, service)),
    ),
  ),
);

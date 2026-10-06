import { Context, Effect, Layer, Ref } from "effect";
import { RuntimeEnvironment } from "../../src/server-runtime/runtime-environment.js";
import type { RuntimeEnvironmentOperations } from "../../src/server-runtime/server-runtime.types.js";
import type { ServerRuntimeFailure } from "../../src/server-runtime/server-runtime.schemas.js";

/** Stateful test controls supplied through the same production environment contract. */
interface RuntimeEnvironmentTestOperations extends RuntimeEnvironmentOperations {
  readonly reports: () => Effect.Effect<ReadonlyArray<ServerRuntimeFailure>>;
}
/** Deterministic report inspection; application logic only requires RuntimeEnvironment. */
export class RuntimeEnvironmentTest extends Context.Service<
  RuntimeEnvironmentTest,
  RuntimeEnvironmentTestOperations
>()("@relkit/cli/ServerRuntime/TestEnvironment") {}

/** Configured fakes use the caller's TestClock and own one fresh abort controller. */
export const runtimeTestLayer = Layer.effectContext(
  Effect.gen(function* () {
    const reports = yield* Ref.make<ReadonlyArray<ServerRuntimeFailure>>([]);
    const controller = yield* Effect.acquireRelease(
      Effect.sync(() => new AbortController()),
      (value) => Effect.sync(() => value.abort()),
    );
    const service = RuntimeEnvironmentTest.of({
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
    });
    return Context.empty().pipe(
      Context.add(RuntimeEnvironment, service),
      Context.add(RuntimeEnvironmentTest, service),
    );
  }),
);

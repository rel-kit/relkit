import { Effect, Fiber, Metric } from "effect";
import { expect, test } from "vitest";
import {
  createRemoteObservabilityRuntime,
  makeRemoteObservabilityRuntimeEffect,
  remoteObservabilityRuntimeLayer,
  RemoteObservabilityRuntimeService,
} from "../src/remote-runtime.js";
import type { RemoteObservabilityRuntimeEffects } from "../src/remote-runtime-effect.types.js";
import { ObservabilityStreamError } from "../src/stream.js";
const remote = { url: "https://telemetry.example.test", token: "test-token" };
test("remote runtime Effect exposes tagged configuration failures and metrics", async () => {
  const registry = new Map();
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const failure = yield* makeRemoteObservabilityRuntimeEffect({ maxRecords: 0 }, remote).pipe(
        Effect.flip,
      );
      const failures = yield* Metric.value(
        Metric.counter("relkit_observability_remote_runtime_operations_total", {
          attributes: { operation: "create", outcome: "failure" },
        }),
      );
      return { failure, failures };
    }).pipe(Effect.provideService(Metric.MetricRegistry, registry)),
  );
  expect(result.failure).toMatchObject({ _tag: "RemoteRuntimeError", operation: "create" });
  expect(result.failures.count).toBe(1);
  await expect(createRemoteObservabilityRuntime({ maxRecords: 0 }, remote)).rejects.toThrow();
});
test("interrupting the remote runtime Layer releases its stream", async () => {
  let ready!: () => void;
  const started = new Promise<void>((resolve) => {
    ready = resolve;
  });
  let runtime!: RemoteObservabilityRuntimeEffects;
  const fiber = Effect.runFork(
    Effect.gen(function* () {
      runtime = yield* RemoteObservabilityRuntimeService;
      ready();
      yield* Effect.never;
    }).pipe(Effect.provide(remoteObservabilityRuntimeLayer({}, remote))),
  );
  await started;
  await Effect.runPromise(Fiber.interrupt(fiber));
  expect(() => runtime.stream.publish({ type: "log.emitted", data: {} })).toThrow(
    ObservabilityStreamError,
  );
  await runtime.close();
});

import { expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber, Layer, Metric } from "effect";
import { createLoggerLayer } from "@relkit/runtime-effect/logger";
import type { LogRecord } from "@relkit/runtime-effect/logger";
import type { ObservabilityRecord } from "@relkit/observability";
import { createObservabilityCollector } from "@relkit/observability";
import {
  createSupervisorObservabilityLayer,
  SupervisorObservabilityOwner,
} from "../../src/observability-service.js";
import type { SupervisorOutcomeTelemetry } from "../../src/state-machine.types.js";
import { nativeGate } from "../fixtures/native-gate.js";
import { createSupervisorObservability } from "../../src/observability.js";

const fingerprint = {
  graphHash: "sha256:graph",
  manifestHash: "sha256:manifest",
  runtimeIntegrationsPlanHash: "sha256:integrations",
};
const outcome: SupervisorOutcomeTelemetry = {
  type: "outcome",
  sequence: 1,
  phase: "compile",
  outcome: "compile-failed",
  sourceToken: 1,
  generationToken: 1,
  error: { message: "password=raw-secret" },
};

it.live("a sink reentering public close owns the complete admitted persistence batch", () =>
  Effect.promise(async () => {
    const collector = createObservabilityCollector();
    let close: Promise<void> | undefined;
    let appended = 0;
    const observer = createSupervisorObservability({
      activationFingerprint: fingerprint,
      logger: { human: false, json: false },
      append: async () => {
        appended++;
      },
      collector: {
        collect: (record) => {
          close ??= observer.close!();
          return collector.collect(record);
        },
      },
    });
    try {
      observer.emit(outcome);
      if (close === undefined) throw new Error("Expected reentrant owner close.");
      await close;
      expect(appended).toBe(2);
      expect(() => observer.emit(outcome)).toThrow("Supervisor observability is closed.");
    } finally {
      await observer.close!();
    }
  }),
);

it.effect(
  "serial append retains redaction, injected time and snapshot flush after a sink failure",
  () =>
    Effect.gen(function* () {
      const gates = Array.from({ length: 4 }, () => nativeGate<void>());
      const entered = yield* Effect.forEach(gates, () => Deferred.make<void>());
      const records: ObservabilityRecord[] = [];
      const collector = createObservabilityCollector();
      const logs: LogRecord[] = [];
      const registry: Metric.MetricRegistry = new Map();
      let appends = 0;
      yield* Effect.gen(function* () {
        const observer = yield* SupervisorObservabilityOwner;
        yield* observer.emit(outcome);
        yield* Deferred.await(entered[0]!);
        const first = records[0];
        if (first?.signal !== "generation")
          throw new Error("Expected the lifecycle generation projection.");
        expect(first.occurredAt).toBe("1970-01-01T00:00:00.000Z");
        const flushing = yield* Effect.forkChild(observer.flush, { startImmediately: true });
        yield* observer.emit({ ...outcome, sequence: 2 });
        expect(appends).toBe(1);
        gates[0]!.fail(new Error("password=append-secret"));
        yield* Deferred.await(entered[1]!);
        gates[1]!.complete(undefined);
        yield* Fiber.join(flushing);
        yield* Deferred.await(entered[2]!);
        gates[2]!.complete(undefined);
        yield* Deferred.await(entered[3]!);
        gates[3]!.complete(undefined);
        yield* observer.flush;
      }).pipe(
        Effect.ensuring(Effect.sync(() => gates.forEach((gate) => gate.complete(undefined)))),
        Effect.provide(
          Layer.merge(
            createSupervisorObservabilityLayer({
              activationFingerprint: fingerprint,
              collector: {
                collect: (record) => {
                  records.push(record);
                  return collector.collect(record);
                },
              },
              append: () => {
                const index = appends++;
                Deferred.doneUnsafe(entered[index]!, Effect.void);
                return gates[index]!.promise;
              },
            }),
            createLoggerLayer({
              minimumLevel: "error",
              json: false,
              human: { write: (_line, record) => logs.push(record) },
            }),
          ),
        ),
        Effect.provideService(Metric.MetricRegistry, registry),
      );
      expect(appends).toBe(4);
      expect(JSON.stringify(records)).not.toContain("raw-secret");
      expect(logs).toHaveLength(1);
      expect(JSON.stringify(logs)).not.toContain("append-secret");
      expect(
        [...registry.values()]
          .filter(
            (entry) =>
              entry.id === "relkit_execution_outcomes_total" &&
              entry.attributes?.operation === "observability.append",
          )
          .map((entry) => entry.attributes?.outcome)
          .sort(),
      ).toEqual(["failure", "success"]);
      expect(
        [...registry.values()].some(
          (entry) =>
            entry.id === "relkit_execution_outcomes_total" &&
            entry.attributes?.operation === "observability.flush" &&
            entry.attributes?.outcome === "success",
        ),
      ).toBe(true);
    }),
);

it.effect(
  "scope interruption joins a pending native append without starting queued persistence",
  () =>
    Effect.gen(function* () {
      const native = nativeGate<void>();
      const entered = yield* Deferred.make<void>();
      let appends = 0;
      const owner = yield* Effect.forkChild(
        Effect.gen(function* () {
          const observer = yield* SupervisorObservabilityOwner;
          yield* observer.emit(outcome);
          yield* Deferred.await(entered);
          return yield* Effect.never;
        }).pipe(
          Effect.provide(
            Layer.merge(
              createSupervisorObservabilityLayer({
                activationFingerprint: fingerprint,
                append: () => {
                  appends++;
                  Deferred.doneUnsafe(entered, Effect.void);
                  return native.promise;
                },
              }),
              createLoggerLayer({ human: false, json: false }),
            ),
          ),
        ),
      );
      yield* Effect.gen(function* () {
        yield* Deferred.await(entered);
        const closing = yield* Effect.forkChild(Fiber.interrupt(owner), { startImmediately: true });
        expect(closing.pollUnsafe()).toBeUndefined();
        expect(appends).toBe(1);
        native.complete(undefined);
        yield* Fiber.join(closing);
        expect(appends).toBe(1);
      }).pipe(Effect.ensuring(Effect.sync(() => native.complete(undefined))));
    }),
);

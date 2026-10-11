/**
 * Verifies policy publication and inherited logging at native relay callbacks.
 * Barriers hold the first canonical configuration while a newer generation waits;
 * acquired callbacks retain the supplied logger, correlation and metric registry.
 */
import { expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber, Metric, Ref } from "effect";
import { createLoggerLayer } from "@relkit/runtime-effect";
import { telemetryRelayFixture } from "./telemetry-relay-fixture.js";
import type { LogRecord } from "@relkit/observability";

it.effect("serializes the latest configuration against canonical-store publication", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      const calls = yield* Ref.make(0);
      const fixture = yield* telemetryRelayFixture({
        configure: () =>
          Effect.gen(function* () {
            const call = yield* Ref.updateAndGet(calls, (count) => count + 1);
            if (call !== 1) return;
            yield* Deferred.succeed(entered, undefined);
            yield* Deferred.await(release);
          }),
      });
      const support = yield* Effect.forkScoped(fixture.relay.run(fixture.log));
      yield* Deferred.await(fixture.acquired);
      yield* Deferred.succeed(fixture.acquire, undefined);
      yield* Deferred.await(entered);
      const latest = { capture: { signals: ["log" as const] } };
      const updating = yield* Effect.forkScoped(fixture.relay.configureEffect(latest));
      yield* Effect.yieldNow;
      expect((yield* Ref.get(fixture.configurations)).length).toBe(1);
      yield* Deferred.succeed(release, undefined);
      yield* Fiber.join(updating);
      expect((yield* Ref.get(fixture.configurations)).at(-1)?.capture).toEqual(latest.capture);
      yield* Fiber.interrupt(support);
      expect(yield* Deferred.isDone(fixture.released)).toBe(true);
    }),
  ),
);

it.effect("native ingress retains the owning logger, correlation and one method observation", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const logs: LogRecord[] = [];
      const registry: Metric.MetricRegistry = new Map();
      const fixture = yield* telemetryRelayFixture().pipe(
        Effect.provide(
          createLoggerLayer({ human: false, json: { write: (record) => logs.push(record) } }),
        ),
        Effect.provideService(Metric.MetricRegistry, registry),
        Effect.annotateLogs({ correlationId: "relay-session-test" }),
      );
      const response = yield* Effect.promise(() =>
        fixture.handler(
          new Request("http://relay/records", {
            method: "POST",
            headers: {
              authorization: `Bearer ${fixture.relay.environment.RELKIT_TELEMETRY_TOKEN}`,
            },
            body: '{"records":[]}',
          }),
        ),
      );
      expect(response.status).toBe(200);
      const calls = [...registry.values()].filter(
        (entry) =>
          entry.id === "relkit_execution_operations_total" &&
          entry.attributes?.operation === "dev.telemetry.early-ingress",
      );
      expect(calls).toHaveLength(1);
      const ingress = logs.filter(
        (record) => record.fields.operation === "dev.telemetry.early-ingress",
      );
      expect(ingress).toHaveLength(1);
      expect(ingress[0]?.correlationId).toBe("relay-session-test");
      expect(ingress[0]?.fields.outcome).toBe("success");
      expect(ingress[0]?.fields.duration_ms).toBeGreaterThanOrEqual(0);
    }),
  ),
);

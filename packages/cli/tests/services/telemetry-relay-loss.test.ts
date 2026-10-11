/**
 * Proves early loss survives terminal delivery before persistent acquisition.
 * Explicit barriers exercise saturation and later canonical diagnostic admission;
 * no real worker, native timer or disk store participates in the test.
 */
import { expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber, Ref } from "effect";
import { telemetryRelayFixture } from "./telemetry-relay-fixture.js";
import type { DiagnosticRecord, LogRecord } from "@relkit/observability";
import type { DevTelemetryRelay } from "../../src/commands/dev-telemetry-relay.types.js";

/** Asserts pending queries expose cumulative loss without revealing producer secrets. */
const assertPendingLoss = Effect.fn("TelemetryLossTest.pendingQuery")(function* (
  relay: DevTelemetryRelay,
) {
  const pending = relay.handle(new Request("http://backend/_relkit/v1/storage"));
  if (pending === undefined) return yield* Effect.die(new Error("Missing storage status"));
  const response = yield* Effect.promise(() => pending);
  const text = yield* Effect.promise(() => response.text());
  expect(response.status).toBe(503);
  expect(text).toContain('"bufferedRecords":2048');
  expect(text).toContain('"droppedRecords":2');
  expect(text).toContain('"incomplete":true');
  expect(text).not.toContain("SYNTHETIC_SECRET");
});

it.live("retains coalesced overflow for eventual persistence after terminal delivery", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const warned = yield* Deferred.make<void>();
      const persisted = yield* Deferred.make<DiagnosticRecord>();
      const fixture = yield* telemetryRelayFixture({
        log: (event) => {
          if (event.event === "dev.telemetry.overflow") Deferred.doneUnsafe(warned, Effect.void);
        },
        append: (record) => {
          if (record.signal !== "diagnostic")
            throw new Error("Expected independent loss diagnostic");
          Deferred.doneUnsafe(persisted, Effect.succeed(record));
        },
      });
      yield* Effect.sync(() => {
        for (let index = 0; index < 2050; index++) fixture.relay.append(earlyRecord);
      });
      yield* assertPendingLoss(fixture.relay);
      const fiber = yield* Effect.forkScoped(fixture.relay.run(fixture.log));
      yield* Deferred.await(warned);
      expect(yield* Deferred.isDone(persisted)).toBe(false);
      expect(
        (yield* Ref.get(fixture.events)).filter(
          (event) => event.event === "dev.telemetry.overflow",
        ),
      ).toHaveLength(1);
      yield* Deferred.succeed(fixture.acknowledge, undefined);
      yield* Deferred.succeed(fixture.acquire, undefined);
      const diagnostic = yield* Deferred.await(persisted);
      expect(diagnostic.code).toBe("RELKIT_EARLY_TELEMETRY_OVERFLOW");
      expect(diagnostic.message).toContain("2 records");
      expect(JSON.stringify(diagnostic)).not.toContain("SYNTHETIC_SECRET");
      expect(
        (yield* Ref.get(fixture.events)).filter(
          (event) => event.event === "dev.telemetry.overflow",
        ),
      ).toHaveLength(1);
      yield* Fiber.interrupt(fiber);
      expect(yield* Deferred.isDone(fixture.released)).toBe(true);
    }),
  ),
);

/** Synthetic producer secret exercises redaction before bounded early admission. */
const earlyRecord: LogRecord = {
  version: 2,
  signal: "log",
  timestamp: "2026-10-09T00:00:00.000Z",
  level: "info",
  component: "loss.test",
  message: "early",
  fields: { password: "SYNTHETIC_SECRET" },
};

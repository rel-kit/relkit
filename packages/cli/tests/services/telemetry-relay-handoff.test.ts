/**
 * Controls canonical acknowledgements through the live relay's injected HTTP seam.
 * Durable producer keys make ambiguous-response retries idempotent. Explicit
 * barriers prove later arrivals do not join or disappear with an earlier batch.
 */
import { expect, it } from "@effect/vitest";
import { Cause, Deferred, Effect, Fiber, Ref } from "effect";
import { TestClock } from "effect/testing";
import { cliAdapterError } from "../../src/cli-errors.js";
import { telemetryRelayFixture } from "./telemetry-relay-fixture.js";
import type { LogRecord } from "@relkit/observability";

/** Creates a finite admitted model record whose message identifies its arrival. */
function record(message: string): LogRecord {
  return {
    version: 2,
    signal: "log",
    timestamp: "2026-10-09T00:00:00.000Z",
    level: "info",
    component: "relay.handoff.test",
    message,
    fields: {},
  };
}

it.live("retries an ambiguous acknowledgement using the identical immutable envelope", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const retried = yield* Deferred.make<void>();
      const bodies = yield* Ref.make<string[]>([]);
      const fixture = yield* telemetryRelayFixture({
        request: (_url, options) =>
          Effect.gen(function* () {
            const submitted = yield* Ref.updateAndGet(bodies, (previous) => [
              ...previous,
              String(options?.body),
            ]);
            if (submitted.length === 1)
              return new Response("Acknowledgement lost", { status: 503 });
            yield* Deferred.succeed(retried, undefined);
            return Response.json({ ok: true });
          }),
      });
      fixture.relay.append(record("before storage"), "application");
      const support = yield* Effect.forkScoped(fixture.relay.run(fixture.log));
      yield* Deferred.await(fixture.acquired);
      yield* Deferred.succeed(fixture.acquire, undefined);
      yield* Deferred.await(retried);
      yield* Fiber.interrupt(support);
      const attempts = yield* Ref.get(bodies);
      expect(attempts.length).toBeGreaterThanOrEqual(2);
      expect(attempts.length).toBeLessThanOrEqual(3);
      expect(new Set(attempts).size).toBe(1);
      expect(attempts[0]).toContain('"origin":"application"');
      expect(yield* fixture.cleanup.snapshot()).toEqual([]);
    }),
  ),
);

it.live("retires only the acknowledged prefix while concurrent arrivals stay separate", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const first = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      const second = yield* Deferred.make<void>();
      const bodies = yield* Ref.make<string[]>([]);
      const fixture = yield* telemetryRelayFixture({
        request: (_url, options) =>
          Effect.gen(function* () {
            const submitted = yield* Ref.updateAndGet(bodies, (previous) => [
              ...previous,
              String(options?.body),
            ]);
            if (submitted.length === 1) {
              yield* Deferred.succeed(first, undefined);
              yield* Deferred.await(release);
            } else yield* Deferred.succeed(second, undefined);
            return Response.json({ ok: true });
          }),
      });
      fixture.relay.append(record("first arrival"));
      const support = yield* Effect.forkScoped(fixture.relay.run(fixture.log));
      yield* Deferred.await(fixture.acquired);
      yield* Deferred.succeed(fixture.acquire, undefined);
      yield* Deferred.await(first);
      fixture.relay.append(record("later arrival"));
      yield* Deferred.succeed(release, undefined);
      yield* Deferred.await(second);
      const submitted = yield* Ref.get(bodies);
      expect(submitted[0]).toContain("first arrival");
      expect(submitted[0]).not.toContain("later arrival");
      expect(submitted[1]).toContain("later arrival");
      expect(submitted[1]).not.toContain("first arrival");
      yield* Fiber.interrupt(support);
    }),
  ),
);

it.effect("preserves a mixed failure while retrying without closing backend-facing ingress", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const failed = yield* Deferred.make<void>();
      const calls = yield* Ref.make(0);
      const cause = Cause.combine(
        Cause.fail(cliAdapterError("handoff.test", new Error("Expected failure"))),
        Cause.die(new Error("Secondary defect")),
      );
      const fixture = yield* telemetryRelayFixture({
        request: () =>
          Ref.update(calls, (count) => count + 1).pipe(Effect.andThen(Effect.failCause(cause))),
      });
      fixture.relay.append(record("retained after failure"));
      const support = yield* Effect.forkScoped(
        fixture.relay.run((event) => {
          fixture.log(event);
          if (event.event === "dev.storage.failed") Deferred.doneUnsafe(failed, Effect.void);
        }),
      );
      yield* Deferred.await(fixture.acquired);
      yield* Deferred.succeed(fixture.acquire, undefined);
      yield* Deferred.await(failed);
      expect(yield* Ref.get(calls)).toBe(2); // One live attempt, one bounded shutdown flush.
      const evidence = yield* fixture.cleanup.snapshot();
      expect(
        evidence.some(
          (entry) =>
            entry.operation === "dev.telemetry.support" && entry.cause.reasons.length === 2,
        ),
      ).toBe(true);
      const response = fixture.relay.handle(new Request("http://backend/_relkit/v1/storage"));
      if (response === undefined)
        return yield* Effect.die(new Error("Expected status interception"));
      const status = yield* Effect.promise(() => response);
      expect(status.status).toBe(503);
      expect(yield* Effect.promise(() => status.text())).toContain('"storageState":"unavailable"');
      expect(support.pollUnsafe()).toBeUndefined();
      yield* TestClock.adjust(1_000);
      yield* Effect.yieldNow;
      expect(yield* Ref.get(calls)).toBeGreaterThan(2);
      yield* Fiber.interrupt(support);
      expect(yield* Deferred.isDone(fixture.released)).toBe(true);
    }),
  ),
);

it.effect("times out stalled acquisition and recovers on a later bounded retry", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const fixture = yield* telemetryRelayFixture();
      const support = yield* Effect.forkScoped(fixture.relay.run(fixture.log));
      yield* Deferred.await(fixture.acquired);
      yield* TestClock.adjust(5_000);
      yield* Effect.yieldNow;
      const unavailable = fixture.relay.handle(new Request("http://backend/_relkit/v1/storage"));
      if (unavailable === undefined) return yield* Effect.die(new Error("Expected status"));
      expect((yield* Effect.promise(() => unavailable)).status).toBe(503);
      yield* Deferred.succeed(fixture.acquire, undefined);
      yield* TestClock.adjust(1_000);
      yield* Effect.yieldNow;
      const recovered = fixture.relay.handle(new Request("http://backend/_relkit/v1/storage"));
      if (recovered === undefined) return yield* Effect.die(new Error("Expected status"));
      expect((yield* Effect.promise(() => recovered)).status).toBe(200);
      yield* Fiber.interrupt(support);
    }),
  ),
);

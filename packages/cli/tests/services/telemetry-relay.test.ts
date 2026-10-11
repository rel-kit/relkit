/**
 * Verifies early ingress and persistence through deterministic acquired Layers.
 * Storage barriers prove independent readiness; synthetic secrets prove admission
 * happens before handoff, and a delayed acknowledgement fences later records.
 */
import { expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber, Ref } from "effect";
import { telemetryRelayFixture } from "./telemetry-relay-fixture.js";
import type { LogRecord } from "@relkit/observability";

/** Creates a precise model record with one synthetic secret to exercise redaction. */
function record(message: string): LogRecord {
  return {
    version: 2,
    signal: "log",
    timestamp: "2026-10-09T00:00:00.000Z",
    level: "info",
    component: "relay.test",
    message,
    fields: { password: "SYNTHETIC_SECRET" },
  };
}

it.effect("ingress accepts redacted records while persistent acquisition is pending", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const fixture = yield* telemetryRelayFixture();
      const fiber = yield* Effect.forkScoped(fixture.relay.run(fixture.log));
      yield* Deferred.await(fixture.acquired);
      const request = new Request(`${fixture.relay.environment.RELKIT_TELEMETRY_URL}/records`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${fixture.relay.environment.RELKIT_TELEMETRY_TOKEN}`,
        },
        body: JSON.stringify({
          records: [{ key: "producer:1", origin: "application", record: record("early") }],
        }),
      });
      const response = yield* Effect.promise(() => fixture.handler(request));
      expect(response.status).toBe(200);
      const pending = fixture.relay.handle(new Request("http://backend/_relkit/v1/storage"));
      expect(pending).toBeDefined();
      if (pending !== undefined) expect((yield* Effect.promise(() => pending)).status).toBe(503);
      expect(yield* Ref.get(fixture.requests)).toEqual([]);
      yield* Deferred.succeed(fixture.acquire, undefined);
      yield* Deferred.await(fixture.persisted);
      expect(
        (yield* Ref.get(fixture.events)).some((event) => event.event === "dev.storage.ready"),
      ).toBe(true);
      const [body] = yield* Ref.get(fixture.requests);
      expect(body).toContain('"key":"producer:1"');
      expect(body).toContain('"origin":"application"');
      expect(body).not.toContain("SYNTHETIC_SECRET");
      yield* Deferred.succeed(fixture.acknowledge, undefined);
      yield* Fiber.interrupt(fiber);
      expect(yield* Deferred.isDone(fixture.released)).toBe(true);
    }),
  ),
);

it.effect("rejects unauthenticated and malformed ingress without persistent acquisition", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const fixture = yield* telemetryRelayFixture();
      const forbidden = yield* Effect.promise(() =>
        fixture.handler(
          new Request("http://relay/records", {
            method: "POST",
            body: "SYNTHETIC_SECRET",
          }),
        ),
      );
      expect(forbidden.status).toBe(401);
      const malformed = yield* Effect.promise(() =>
        fixture.handler(
          new Request("http://relay/records", {
            method: "POST",
            headers: {
              authorization: `Bearer ${fixture.relay.environment.RELKIT_TELEMETRY_TOKEN}`,
            },
            body: '{"records":["SYNTHETIC_SECRET"]}',
          }),
        ),
      );
      expect(malformed.status).toBe(400);
      expect(yield* Effect.promise(() => malformed.text())).not.toContain("SYNTHETIC_SECRET");
      expect(yield* Deferred.isDone(fixture.acquired)).toBe(false);
    }),
  ),
);

it.effect("joins cancellation while storage is still pending", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const fixture = yield* telemetryRelayFixture();
      const fiber = yield* Effect.forkScoped(fixture.relay.run(fixture.log));
      yield* Deferred.await(fixture.acquired);
      yield* Fiber.interrupt(fiber);
      expect(yield* Deferred.isDone(fixture.released)).toBe(false);
      expect(yield* fixture.cleanup.snapshot()).toEqual([]);
    }),
  ),
);

it.effect("serves buffered startup history and live stream before storage is ready", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const fixture = yield* telemetryRelayFixture();
      fixture.relay.append(record("visible before storage"));
      const pending = fixture.relay.handle(new Request("http://backend/_relkit/v1/logs"));
      if (pending === undefined) return yield* Effect.die(new Error("Expected early query"));
      const response = yield* Effect.promise(() => pending);
      expect(response.status).toBe(200);
      expect(yield* Effect.promise(() => response.text())).toContain("visible before storage");
      const stream = fixture.relay.handle(new Request("http://backend/_relkit/v1/stream"));
      if (stream === undefined) return yield* Effect.die(new Error("Expected early stream"));
      const streamResponse = yield* Effect.promise(() => stream);
      expect(streamResponse.status).toBe(200);
      expect(streamResponse.headers.get("content-type")).toContain("text/event-stream");
      yield* Effect.promise(() => streamResponse.body!.cancel());
    }),
  ),
);

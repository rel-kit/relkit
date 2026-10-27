/** Proves CLI capture is memory-only, authenticated, redacted and independent of support bind failure. */
import { expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { InspectionNative, InspectionConnectionError } from "@relkit/inspector-api/connection";
import type { InspectionNativeOperations } from "@relkit/inspector-api/connection";
import { CliDevCapture } from "../../src/commands/dev-capture.service.js";

/** Supplies bounded transport authority without ever opening a store or native socket. */
function fixture(fail = false) {
  let starts = 0;
  let stops = 0;
  let producer: Parameters<InspectionNativeOperations["listen"]>[1] | undefined;
  const native: InspectionNativeOperations = {
    listen: (_options, handler) =>
      Effect.gen(function* () {
        starts++;
        if (fail)
          return yield* new InspectionConnectionError({
            operation: "fixture.bind",
            cause: new Error("bind failed"),
          });
        producer = handler;
        return yield* Effect.acquireRelease(Effect.succeed("http://127.0.0.1:43210"), () =>
          Effect.sync(() => {
            stops++;
          }),
        );
      }),
    forward: () => Effect.die("capture does not forward application operations"),
  };
  return {
    starts: () => starts,
    stops: () => stops,
    producer: () => producer!,
    layer: Layer.effect(CliDevCapture, CliDevCapture.make).pipe(
      Layer.provide(Layer.succeed(InspectionNative, native)),
    ),
  };
}

it.effect("installed-but-disabled capture opens no support resource", () => {
  const f = fixture();
  return Effect.scoped(
    Effect.gen(function* () {
      const capture = yield* CliDevCapture.use((service) => service.acquire(false, {}));
      expect(f.starts()).toBe(0);
      expect(capture.environment.RELKIT_TELEMETRY_URL).toBeUndefined();
      expect(
        (yield* capture.records(new Request("http://localhost/_relkit/bridge/v1/records"))).status,
      ).toBe(503);
    }),
  ).pipe(Effect.provide(f.layer));
});

it.effect("support bind failure degrades capture without preventing backend startup", () => {
  const f = fixture(true);
  return Effect.scoped(
    Effect.gen(function* () {
      const capture = yield* CliDevCapture.use((service) => service.acquire(true, {}));
      expect(capture.environment.RELKIT_TELEMETRY_URL).toBeUndefined();
      const status = yield* capture.records(
        new Request("http://localhost/_relkit/bridge/v1/records"),
      );
      expect(yield* Effect.promise(() => status.json())).toMatchObject({ incomplete: true });
    }),
  ).pipe(Effect.provide(f.layer));
});

it.effect("validates producer auth/body and redacts before memory replay", () => {
  const f = fixture();
  return Effect.scoped(
    Effect.gen(function* () {
      const capture = yield* CliDevCapture.use((service) =>
        service.acquire(true, { redaction: { redactKeys: ["customerEmail"] } }),
      );
      const send = (token: string, body: string) =>
        f.producer()(
          new Request("http://127.0.0.1:43210/records", {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
            body,
          }),
        );
      expect((yield* send("wrong", "{}")).status).toBe(401);
      expect((yield* send(capture.environment.RELKIT_TELEMETRY_TOKEN!, "{")).status).toBe(400);
      const body = JSON.stringify({
        records: [
          {
            key: "producer:1",
            origin: "application",
            record: {
              version: 2,
              signal: "log",
              timestamp: "2026-10-23T00:00:00.000Z",
              level: "info",
              component: "app",
              message: "safe",
              fields: { customerEmail: "private@example.test", password: "never" },
            },
          },
        ],
      });
      expect((yield* send(capture.environment.RELKIT_TELEMETRY_TOKEN!, body)).status).toBe(200);
      const records = yield* capture.records(
        new Request("http://localhost/_relkit/bridge/v1/records"),
      );
      const bytes = yield* Effect.promise(() => records.text());
      expect(bytes).toContain("safe");
      expect(bytes).not.toContain("private@example.test");
      expect(bytes).not.toContain("never");
    }),
  ).pipe(Effect.provide(f.layer));
});

it.effect("closing the session joins its exact producer listener once", () => {
  const f = fixture();
  return Effect.gen(function* () {
    yield* Effect.scoped(CliDevCapture.use((service) => service.acquire(true, {})));
    expect(f.starts()).toBe(1);
    expect(f.stops()).toBe(1);
  }).pipe(Effect.provide(f.layer));
});

it.effect("enabling mid-session opens ingress once and disabling releases it", () => {
  const f = fixture();
  return Effect.scoped(
    Effect.gen(function* () {
      const capture = yield* CliDevCapture.use((service) => service.acquire(false, {}));
      const enabled = yield* capture.enableEffect;
      expect(enabled.RELKIT_TELEMETRY_URL).toBe("http://127.0.0.1:43210");
      expect(yield* capture.enableEffect).toEqual(enabled);
      expect(f.starts()).toBe(1);
      const records = new Request("http://localhost/_relkit/bridge/v1/records");
      expect((yield* capture.records(records)).status).toBe(200);
      yield* capture.disableEffect;
      expect(f.stops()).toBe(1);
      expect((yield* capture.records(records)).status).toBe(503);
      expect((yield* capture.enableEffect).RELKIT_TELEMETRY_TOKEN).not.toBe(
        enabled.RELKIT_TELEMETRY_TOKEN,
      );
      expect(f.starts()).toBe(2);
    }),
  ).pipe(Effect.provide(f.layer));
});

it.effect("re-enabled capture continues the session's record sequence", () => {
  const f = fixture();
  return Effect.scoped(
    Effect.gen(function* () {
      const capture = yield* CliDevCapture.use((service) => service.acquire(false, {}));
      const record = (message: string) => ({
        version: 2 as const,
        signal: "log" as const,
        timestamp: new Date().toISOString(),
        level: "info" as const,
        component: "relkit",
        message,
        fields: {},
      });
      const sequences = Effect.fn(function* () {
        const response = yield* capture.records(
          new Request("http://localhost/_relkit/bridge/v1/records?after=0"),
        );
        const body = (yield* Effect.promise(() => response.json())) as {
          records: { sequence: number }[];
        };
        return body.records.map((entry) => entry.sequence);
      });
      yield* capture.enableEffect;
      capture.append(record("first"));
      const before = yield* sequences();
      yield* capture.disableEffect;
      capture.append(record("while disabled"));
      yield* capture.enableEffect;
      capture.append(record("second"));
      const after = yield* sequences();
      expect(before).toHaveLength(1);
      expect(after).toHaveLength(2);
      expect(after[1]!).toBeGreaterThan(before[0]!);
    }),
  ).pipe(Effect.provide(f.layer));
});

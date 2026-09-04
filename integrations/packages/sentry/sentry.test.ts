import { expect, test } from "bun:test";
import { admitObservabilityRecord } from "@relkit/observability";
import { createBindingValueRef } from "@relkit/provider";
import { sentry } from "./src/index.ts";
import { createSentryExporter, type SentryScope, type SentrySdk } from "./src/runtime/index.ts";

test("declares a value-free Sentry exporter without loading the SDK", () => {
  const descriptor = sentry({
    dsn: createBindingValueRef("SENTRY_DSN", "secret-string"),
    environment: "test",
  });

  expect(descriptor).toEqual({
    kind: "telemetry-exporter",
    protocolVersion: 1,
    integrationId: "sentry",
    adapterId: "sentry",
    configuration: {
      dsn: {
        kind: "binding-value-ref",
        name: "SENTRY_DSN",
        type: "secret-string",
        sensitive: true,
      },
      environment: "test",
    },
  });
  expect(Object.isFrozen(descriptor)).toBe(true);
  expect(() => sentry({ dsn: "dsn", tracesSampleRate: 1 } as never)).toThrow(
    'Unknown Sentry option "tracesSampleRate"',
  );
});

test("delegates capture, buffering, flush, and close to the Sentry SDK", async () => {
  const initialized: Array<Readonly<Record<string, unknown>>> = [];
  const captured: Error[] = [];
  const events: Array<Readonly<Record<string, unknown>>> = [];
  const tags: Record<string, string> = {};
  const flushes: number[] = [];
  const closes: number[] = [];
  const sdk: SentrySdk = {
    init: (options) => initialized.push(options),
    withScope: (callback) =>
      callback({ setTag: (name, value) => (tags[name] = value) } satisfies SentryScope),
    captureException: (error) => captured.push(error),
    captureEvent: (event) => events.push(event),
    flush: async (timeout) => {
      flushes.push(timeout ?? -1);
      return true;
    },
    close: async (timeout) => {
      closes.push(timeout ?? -1);
      return true;
    },
  };
  const exporter = await createSentryExporter({
    dsn: "https://public@example.test/1",
    sdk,
  });

  exporter.exportRecord(
    admitObservabilityRecord({
      version: 2,
      signal: "log",
      timestamp: "2026-09-02T00:00:00.000Z",
      level: "error",
      component: "test",
      message: "redacted failure",
      fields: {},
      traceId: "10000000000000000000000000000001",
    })!,
  );
  exporter.exportRecord(
    admitObservabilityRecord({
      version: 2,
      signal: "log",
      timestamp: "2026-09-02T00:00:00.001Z",
      level: "info",
      component: "test",
      message: "safe event",
      fields: {},
    })!,
  );
  expect(initialized).toEqual([{ dsn: "https://public@example.test/1", sendDefaultPii: false }]);
  expect(captured[0]?.message).toBe("redacted failure");
  expect(events[0]).toMatchObject({ message: "safe event", level: "info" });
  expect(tags).toMatchObject({
    "relkit.signal": "log",
    "relkit.trace_id": "10000000000000000000000000000001",
  });
  expect(await exporter.flush(500)).toBe(true);
  expect(await exporter.close(750)).toBe(true);
  expect(flushes).toEqual([500]);
  expect(closes).toEqual([750]);
  expect(() =>
    exporter.exportRecord(
      admitObservabilityRecord({
        version: 2,
        signal: "diagnostic",
        code: "RELKIT_LATE",
        severity: "error",
        message: "late",
        occurredAt: "2026-09-02T00:00:00.000Z",
      })!,
    ),
  ).toThrow("closed");
});

test("validates bounded flush inputs", async () => {
  const exporter = await createSentryExporter({
    dsn: "dsn",
    sdk: {
      init: () => undefined,
      withScope: () => undefined,
      captureException: () => undefined,
      captureEvent: () => undefined,
      flush: async () => true,
      close: async () => true,
    },
  });
  expect(() => exporter.flush(30_001)).toThrow("between 0 and 30000");
});

import { Cause, Effect, References } from "effect";
import { normalizeProtocolId } from "@relkit/contracts";
import { createObservabilityCollector } from "@relkit/observability";
import {
  createLoggerLayer,
  formatHumanLog,
  type HumanLogSink,
  type JsonLogSink,
  type LogRecord,
} from "./src/logger.js";
import { IdSource } from "./src/services.js";
import { withRootSpan } from "./src/tracing.js";

function capture(): {
  readonly records: LogRecord[];
  readonly human: HumanLogSink;
  readonly json: JsonLogSink;
} {
  const records: LogRecord[] = [];
  return {
    records,
    human: { write: (_line, record) => records.push(record) },
    json: { write: (record) => records.push(record) },
  };
}

test("filters levels and writes human/json records", async () => {
  const output = capture();
  await Effect.runPromise(
    Effect.gen(function* () {
      yield* Effect.logInfo("hidden");
      yield* Effect.logWarning("shown");
    }).pipe(
      Effect.provide(
        createLoggerLayer({
          component: "runtime.test",
          minimumLevel: "warn",
          human: output.human,
          json: output.json,
        }),
      ),
    ),
  );
  expect(output.records).toHaveLength(2);
  expect(output.records[0]?.level).toBe("warn");
  expect(output.records[0]?.component).toBe("runtime.test");
});

test("formats correlated human and structured JSON logs", () => {
  const record: LogRecord = {
    version: 1,
    signal: "log",
    timestamp: "2026-08-16T00:00:00.000Z",
    level: "info",
    component: "runtime.http",
    message: "request completed",
    fields: { route: "/orders", status: 201 },
    requestId: "request-1",
    traceId: "trace-1",
    correlationId: "request-1",
  };

  expect(formatHumanLog(record)).toBe(
    [
      "00:00:00 INFO  runtime.http request completed",
      `${" ".repeat(15)}request=request-1 trace=trace-1 correlation=request-1 route=/orders status=201`,
    ].join("\n"),
  );
  expect(JSON.parse(JSON.stringify(record))).toEqual(record);
});

test("projects invocation and trace annotations", async () => {
  const output = capture();
  const ids = {
    next: (kind: string) => normalizeProtocolId(`${kind}-1`),
  };
  await Effect.runPromise(
    withRootSpan(Effect.logInfo("started").pipe(Effect.annotateLogs({ requestId: "request-1" })), {
      name: "test",
      invocationId: "invocation-1",
      functionId: "orders.get",
      serviceId: "orders",
      correlationId: "correlation-1",
      source: "direct",
    }).pipe(
      Effect.provide(
        createLoggerLayer({ minimumLevel: "trace", human: output.human, json: false }),
      ),
      Effect.provideService(IdSource, ids),
      Effect.provideService(References.MinimumLogLevel, "Trace"),
    ),
  );
  expect(output.records).toHaveLength(1);
  expect(output.records[0]).toMatchObject({
    requestId: "request-1",
    invocationId: "invocation-1",
    traceId: "trace-1",
    correlationId: "correlation-1",
    source: "direct",
    functionId: "orders.get",
    serviceId: "orders",
  });
});

test("admits versioned records and projects causes before sinks", async () => {
  const output = capture();
  const collector = createObservabilityCollector();
  await Effect.runPromise(
    Effect.logError("failed", Cause.die(new Error("password=super-secret"))).pipe(
      Effect.provide(
        createLoggerLayer({ collector, minimumLevel: "trace", human: output.human, json: false }),
      ),
    ),
  );
  const [record] = collector.read();
  expect(record).toMatchObject({ version: 1, signal: "log", level: "error" });
  expect(record?.fields.cause).toMatchObject({
    reasons: [{ kind: "defect", detail: { message: "password=[REDACTED]" } }],
  });
  expect(output.records[0]).toEqual(record);
});

test("runs redaction before either sink", async () => {
  const output = capture();
  const seen: string[] = [];
  const redact = (record: LogRecord): LogRecord => {
    seen.push(record.message);
    return { ...record, message: "[REDACTED]", fields: { token: "[REDACTED]" } };
  };
  await Effect.runPromise(
    Effect.logInfo("raw secret").pipe(
      Effect.provide(
        createLoggerLayer({
          minimumLevel: "trace",
          human: output.human,
          json: output.json,
          redact,
        }),
      ),
    ),
  );
  expect(seen).toEqual(["raw secret"]);
  expect(output.records.every((record) => record.message === "[REDACTED]")).toBe(true);
  expect(output.records.every((record) => !("token" in record.fields))).toBe(true);
  expect(output.records.every((record) => record.version === 1 && record.signal === "log")).toBe(
    true,
  );
});

test("source scan allows direct output only in logger sinks", async () => {
  const child = Bun.spawn([process.execPath, "run", "scripts/check-logger-sinks.ts"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(await child.exited).toBe(0);
  await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
});

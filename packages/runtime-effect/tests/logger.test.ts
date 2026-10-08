import { test, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Cause, Effect, Logger, References } from "effect";
import { normalizeProtocolId } from "@relkit/contracts";
import { observeExecution } from "@relkit/contracts/operation";
import { createObservabilityCollector } from "@relkit/observability";
import {
  createLoggerLayer,
  createEffectLogger,
  formatHumanLog,
  type HumanLogSink,
  type JsonLogSink,
  type LogRecord,
} from "../src/logger.js";
import { IdSource } from "../src/services.js";
import { withRootSpan } from "../src/tracing.js";

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

test("keeps operation evidence out of the default console while retaining requests and errors", async () => {
  for (const minimumLevel of ["info", "debug"] as const) {
    const human = capture();
    const json = capture();
    const collector = createObservabilityCollector();
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* observeExecution("runtime", "server.readiness", Effect.void);
        yield* Effect.exit(observeExecution("runtime", "server.resource", Effect.fail("failed")));
        yield* Effect.logInfo("GET /hello → 200");
        yield* Effect.logError("Database startup failed");
      }).pipe(
        Effect.provide(
          createLoggerLayer({
            minimumLevel,
            human: human.human,
            json: json.json,
            collector,
          }),
        ),
      ),
    );
    expect(human.records.map((record) => record.message)).toEqual(
      minimumLevel === "info"
        ? ["GET /hello → 200", "Database startup failed"]
        : [
            "Execution operation completed",
            "Execution operation failed",
            "GET /hello → 200",
            "Database startup failed",
          ],
    );
    expect(json.records).toHaveLength(4);
    expect(collector.read()).toHaveLength(4);
  }
});

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
    version: 2,
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
    next: (kind: string) =>
      normalizeProtocolId(
        kind === "trace" ? "10000000000000000000000000000001" : "1000000000000001",
      ),
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
    traceId: "10000000000000000000000000000001",
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
  expect(record).toMatchObject({ version: 2, signal: "log", level: "error" });
  expect(record?.signal === "log" ? record.fields.cause : undefined).toMatchObject({
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
  expect(output.records.every((record) => record.version === 2 && record.signal === "log")).toBe(
    true,
  );
});

test("source scan allows direct output only in logger sinks", async () => {
  const result = await promisify(execFile)("bun", ["run", "scripts/check-logger-sinks.ts"]);
  expect(result.stderr).toBe("");
});

test("projects immutable input and sanitizes nested changes from a custom redactor", async () => {
  const output = capture();
  const detail = Object.defineProperty({ message: "safe" }, "hidden", {
    enumerable: true,
    get: () => {
      throw new Error("annotation getter must not run");
    },
  });
  let deep: unknown = new Error("depth boundary");
  for (let index = 0; index < 5; index++) deep = { value: deep };
  await Effect.runPromise(
    Effect.logInfo("projection").pipe(
      Effect.annotateLogs({
        detail,
        deep,
        prototypePayload: JSON.parse('{"__proto__":{"marker":"injected"}}'),
      }),
      Effect.provide(
        createLoggerLayer({
          human: false,
          json: output.json,
          redact: (record) => {
            expect(Object.isFrozen(record)).toBe(true);
            expect(Object.isFrozen(record.fields)).toBe(true);
            expect(Object.getPrototypeOf(record.fields.prototypePayload)).toBe(Object.prototype);
            expect(Reflect.get(record.fields.prototypePayload as object, "marker")).toBeUndefined();
            let projectedError: unknown = record.fields.deep;
            for (let index = 0; index < 5; index++)
              projectedError = (projectedError as { value: unknown }).value;
            expect(projectedError).toMatchObject({ name: "[truncated]", message: "[truncated]" });
            expect(record.fields.detail).toEqual({ hidden: "[unavailable]", message: "safe" });
            const projected = record.fields.detail as Record<string, string>;
            projected.message = "password=custom-secret";
            return record;
          },
        }),
      ),
    ),
  );
  expect(output.records[0]?.fields.detail).toEqual({
    hidden: "[unavailable]",
    message: "password=[REDACTED]",
  });
  expect(detail.message).toBe("safe");
  expect(JSON.stringify(output.records)).not.toContain("custom-secret");
});

test("direct logger construction preserves its configured minimum", async () => {
  const output = capture();
  await Effect.runPromise(
    Effect.gen(function* () {
      yield* Effect.logInfo("hidden");
      yield* Effect.logWarning("visible");
    }).pipe(
      Effect.provide(
        Logger.layer([
          createEffectLogger({ minimumLevel: "warn", human: output.human, json: false }),
        ]),
      ),
    ),
  );
  expect(output.records.map((record) => record.message)).toEqual(["visible"]);
});

test("redaction recovery and sink failures preserve sibling delivery", async () => {
  const output = capture();
  await Effect.runPromise(
    Effect.logInfo("password=secret").pipe(
      Effect.provide(
        createLoggerLayer({
          human: {
            write: () => {
              throw new Error("human unavailable");
            },
          },
          json: output.json,
          redact: () => {
            throw new Error("redactor unavailable");
          },
        }),
      ),
    ),
  );
  expect(output.records).toHaveLength(1);
  expect(output.records[0]?.message).toBe("Log redaction failed");
  expect(JSON.stringify(output.records)).not.toContain("secret");
});

test("configured none and all levels reach the actual sink", async () => {
  const output = capture();
  for (const minimumLevel of ["none", "all"] as const) {
    await Effect.runPromise(
      Effect.logTrace(minimumLevel).pipe(
        Effect.provide(
          createLoggerLayer({
            minimumLevel,
            human: output.human,
            json: false,
          }),
        ),
      ),
    );
  }
  expect(output.records.map((record) => record.message)).toEqual(["all"]);
});

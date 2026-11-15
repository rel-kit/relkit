/**
 * Every log written inside an invocation carries that invocation's function, including logs of
 * provider operations that run their own Effect without the invocation's trace service (the
 * request detail found them, the function page did not). Logs outside an invocation, such as
 * those of the HTTP boundary, carry no function.
 */
import { expect, test } from "vitest";
import { Context, Effect, Option } from "effect";
import { invokeFunction, type InvocationTarget } from "../../src/engine/index.js";
import { z } from "../../src/schema/index.js";
import { createLoggerLayer, type LogRecord } from "../../src/runtime-effect/logger.js";
import { runInExecutionContext, SpanRuntime } from "../../src/invocation/index.js";
import { createSpanId, createTraceId } from "../../src/contracts/index.js";

/** Writes one log the way a provider operation does: a fresh Effect run with its own logger. */
function providerLog(records: LogRecord[], message: string): void {
  Effect.runSync(
    Effect.logInfo(message).pipe(
      Effect.provide(
        createLoggerLayer({
          minimumLevel: "info",
          json: { write: (record) => records.push(record) },
        }),
      ),
    ),
  );
}

test("a provider log written inside an invocation names its function", async () => {
  const records: LogRecord[] = [];
  const target: InvocationTarget = {
    id: "orders.create",
    input: z.object({}),
    output: z.object({ ok: z.literal(true) }),
    handler: () => {
      providerLog(records, "Execution operation completed");
      return { ok: true as const };
    },
  };
  await invokeFunction(target, {});
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({ functionId: "orders.create" });
  expect(records[0]?.invocationId).toBeDefined();
});

test("a log outside any invocation carries no function", async () => {
  const records: LogRecord[] = [];
  const runtime = new SpanRuntime({
    ids: { next: (kind) => (kind === "trace" ? createTraceId() : createSpanId()) },
  });
  const span = runtime.start({
    name: "HTTP GET",
    parent: Option.none(),
    annotations: Context.empty(),
    links: [],
    startTime: 1n,
    kind: "server",
    root: true,
    sampled: true,
  });
  // The HTTP boundary's own context: a request and a span, no function.
  runInExecutionContext({ span, runtime, requestId: "request-1" }, () =>
    providerLog(records, "request received"),
  );
  providerLog(records, "outside");
  expect(records.map((record) => record.functionId)).toEqual([undefined, undefined]);
  expect(records[0]?.requestId).toBe("request-1");
});

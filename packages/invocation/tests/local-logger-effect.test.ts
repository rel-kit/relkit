import { describe, expect, test } from "vitest";
import { Effect, Layer } from "effect";
import { InvocationScopeStorage } from "../src/index.js";
import { createLocalStructuredLogger, createLocalStructuredLoggerEffect } from "../src/dispatcher-context.js";
import type { InvocationRecord, PublicClock } from "../src/index.js";

const record: InvocationRecord = {
  id: "invocation-1", functionId: "tasks.run", traceId: "trace-1",
  startedAt: new Date(0).toISOString(), attempt: 1, source: "direct", status: "started",
};
const time: PublicClock = { now: () => new Date(100), sleep: async () => undefined };

describe("local structured logger Effect", () => {
  test("writes immutable records through the current execution scope Layer", () => {
    const logger = Effect.runSync(createLocalStructuredLoggerEffect(record, time));
    const execution = {
      invocationId: "invocation-child",
      span: { traceId: "trace-child", spanId: "span-child" },
      requestId: "request-1",
    };
    const layer = Layer.succeed(InvocationScopeStorage, {
      current: () => ({ execution: execution as never }),
      run: (_scope, callback) => callback(),
    });
    Effect.runSync(Effect.provide(logger.writeEffect("info", "ready", { count: 2 }), layer));
    expect(Effect.runSync(logger.recordsEffect())).toMatchObject([{
      level: "info", message: "ready", fields: { count: 2 },
      invocationId: "invocation-child", traceId: "trace-child",
      spanId: "span-child", requestId: "request-1",
    }]);
    expect(Object.isFrozen(logger.records[0])).toBe(true);
  });

  test("public logger methods use record metadata outside a scope", () => {
    const logger = createLocalStructuredLogger(record, time);
    logger.trace("enter");
    logger.debug("details");
    logger.warn("late");
    logger.error("failed");
    expect(logger.records.map((entry) => entry.level)).toEqual(["trace", "debug", "warn", "error"]);
    expect(logger.records[2]).toMatchObject({
      level: "warn", message: "late", invocationId: "invocation-1", traceId: "trace-1",
    });
  });
});

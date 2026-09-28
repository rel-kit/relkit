import { expect, test } from "vitest";
import { Effect, Layer } from "effect";
import {
  createOperationId,
  createOperationIdEffect,
  OperationIdEntropy,
  operationIdTimestamp,
  operationIdTimestampEffect,
  parseOperationId,
  parseOperationIdEffect,
} from "../src/index.js";
test("UUIDv7 operation IDs carry enforceable receipt timestamps", () => {
  const now = Date.UTC(2026, 8, 7);
  const id = createOperationId(now);
  expect(operationIdTimestamp(id)).toBe(now);
  expect(parseOperationId(id, { now })).toBe(id);
  expect(() => parseOperationId(id, { now: now + 24 * 60 * 60_000 + 1 })).toThrow(
    expect.objectContaining({ code: "IDEMPOTENCY_WINDOW_EXPIRED" }),
  );
});
test("Effect ID parsing reports tagged syntax, future, and expiry failures", () => {
  const now = Date.UTC(2026, 8, 7);
  const id = createOperationId(now);
  expect(Effect.runSync(operationIdTimestampEffect(id))).toBe(now);
  expect(Effect.runSync(parseOperationIdEffect(id, { now }))).toBe(id);
  expect(parseOperationId(createOperationId())).toMatch(/-7/);
  expect(Effect.runSync(Effect.flip(parseOperationIdEffect("bad", { now })))).toMatchObject({
    _tag: "Realtime.OperationIdFailure",
    code: "OPERATION_ID_INVALID",
  });
  expect(Effect.runSync(Effect.flip(parseOperationIdEffect(id, { now: 0 })))).toMatchObject({
    code: "OPERATION_ID_INVALID",
    reason: "Operation ID timestamp is in the future.",
  });
  expect(
    Effect.runSync(
      Effect.flip(parseOperationIdEffect(id, { now: now + 200, receiptWindowMs: 100 })),
    ),
  ).toMatchObject({
    code: "IDEMPOTENCY_WINDOW_EXPIRED",
  });
  expect(() => parseOperationId("bad", { now })).toThrow("UUIDv7");
});
test("entropy is substitutable while the adapter keeps RangeError behavior", () => {
  const layer = Layer.succeed(OperationIdEntropy, {
    bytes: () => Effect.succeed(new Uint8Array(16)),
  });
  const first = Effect.runSync(Effect.provide(createOperationIdEffect(1234), layer));
  const second = Effect.runSync(Effect.provide(createOperationIdEffect(1234), layer));
  expect(first).toBe(second);
  expect(operationIdTimestamp(first)).toBe(1234);
  expect(
    Effect.runSync(Effect.flip(Effect.provide(createOperationIdEffect(-1), layer))),
  ).toMatchObject({
    _tag: "Realtime.OperationIdFailure",
  });
  expect(() => createOperationId(-1)).toThrow(RangeError);
  expect(() => createOperationId(Number.MAX_SAFE_INTEGER)).toThrow(RangeError);
  const short = Layer.succeed(OperationIdEntropy, {
    bytes: () => Effect.succeed(new Uint8Array(4)),
  });
  expect(
    Effect.runSync(Effect.flip(Effect.provide(createOperationIdEffect(1), short))),
  ).toMatchObject({
    reason: "UUIDv7 entropy must contain 16 bytes.",
  });
});

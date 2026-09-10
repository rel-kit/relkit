import { expect, test } from "bun:test";
import { createOperationId, operationIdTimestamp, parseOperationId } from "./src/index.ts";

test("UUIDv7 operation IDs carry enforceable receipt timestamps", () => {
  const now = Date.UTC(2026, 8, 7);
  const id = createOperationId(now);
  expect(operationIdTimestamp(id)).toBe(now);
  expect(parseOperationId(id, { now })).toBe(id);
  expect(() => parseOperationId(id, { now: now + 24 * 60 * 60_000 + 1 })).toThrow(
    expect.objectContaining({ code: "IDEMPOTENCY_WINDOW_EXPIRED" }),
  );
});

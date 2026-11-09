/** Acquires the real receipt function and event fixtures under one test-owned Effect scope. */
import { Effect } from "effect";
import { defineEvent, defineEventFunction } from "../../../packages/relkit/src/app/events.js";
import { z } from "relkit/schema";
import {
  createTestBucketFake,
  createTestEvent,
  invokeFunction,
} from "../../../packages/testing/src/index.js";
import sendReceipt from "../../../examples/commerce/src/services/receipts/functions/send-receipt.function.js";
import type {
  CapturedSpan,
  InstrumentationFixture,
  ReceiptPayload,
} from "./runtime-instrumentation.types.js";

const retry = {
  maxAttempts: 2,
  initialDelayMs: 10,
  maxDelayMs: 10,
  multiplier: 1,
  jitter: "none" as const,
};
const created = defineEvent({
  id: "orders.created",
  version: 1,
  input: z.object({ orderId: z.string(), receiptKey: z.string() }),
});
declare global {
  namespace Relkit {
    interface EventRegistry {
      readonly "orders.created": typeof created;
    }
  }
}

/**
 * Owns all acquired providers, including partial acquisition failures.
 * @returns Ready native fixture, released in reverse acquisition order by the caller's scope.
 */
export const instrumentationFixture = Effect.gen(function* () {
  const receipts = yield* Effect.acquireRelease(
    Effect.sync(() => createTestBucketFake({ bucketId: "receipts" })),
    (owner) => Effect.promise(() => owner.close()),
  );
  const eventSpans: CapturedSpan[] = [];
  const event = yield* receiptEvent(receipts, eventSpans);
  return { receipts, event, eventSpans } satisfies InstrumentationFixture;
});

/**
 * Owns the receiver's event delivery harness while borrowing the receipt bucket.
 * @param receipts - Scope-owned fake bucket.
 * @param eventSpans - Borrowed observer receiving completed event spans.
 * @returns A scoped event harness whose receiver writes the receipt.
 */
const receiptEvent = Effect.fn("test.receiptEvent")(function* (
  receipts: InstrumentationFixture["receipts"],
  eventSpans: CapturedSpan[],
) {
  const consumer = defineEventFunction({
    id: "orders.write-receipt",
    event: "orders.created",
    handler: async (input) => {
      await invokeFunction(sendReceipt, input, {
        clients: { buckets: { receipts: receipts.provider } },
      });
    },
  });
  const event = yield* Effect.acquireRelease(
    Effect.tryPromise(() =>
      createTestEvent<ReceiptPayload, void>({
        event: created,
        target: consumer,
        retry,
        hooks: { onSpanComplete: (span) => eventSpans.push(span) },
      }),
    ),
    (owner) => Effect.promise(() => owner.close()),
  );
  return event;
});

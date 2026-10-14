/** Acquires the real receipt retry and event fixtures under one test-owned Effect scope. */
import { Effect } from "effect";
import { defineEvent, defineEventFunction } from "../../../packages/app/src/events.js";
import { z } from "../../../packages/schema/src/index.js";
import {
  createTestBucketFake,
  createTestEvent,
  createTestJob,
  invokeFunction,
  type TestFailureControls,
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
  let failReceiptWrite = true;
  const failures: TestFailureControls = {
    failAt: () => undefined,
    clear: () => undefined,
    check: (point) => {
      if (point !== "bucket.before-write" || !failReceiptWrite) return;
      failReceiptWrite = false;
      throw new Error("receipt storage unavailable");
    },
  };
  const receipts = yield* Effect.acquireRelease(
    Effect.sync(() => createTestBucketFake({ bucketId: "receipts", failures })),
    (owner) => Effect.promise(() => owner.close()),
  );
  const jobSpans: CapturedSpan[] = [],
    eventSpans: CapturedSpan[] = [];
  const job = yield* receiptJob(receipts, jobSpans);
  const event = yield* receiptEvent(job, eventSpans);
  return { receipts, job, event, jobSpans, eventSpans } satisfies InstrumentationFixture;
});

/**
 * Owns the retrying job while borrowing the caller's bucket provider.
 * @param receipts - Scope-owned fake bucket.
 * @param jobSpans - Borrowed observer receiving completed job spans.
 * @returns A scoped job; release does not dispose the borrowed bucket.
 */
const receiptJob = (receipts: InstrumentationFixture["receipts"], jobSpans: CapturedSpan[]) =>
  Effect.acquireRelease(
    Effect.tryPromise(() =>
      createTestJob<ReceiptPayload, { readonly receiptId: string }>({
        jobId: "receipts.send",
        target: {
          id: "receipts.retrying-send",
          input: sendReceipt.input,
          output: sendReceipt.output,
          ...(sendReceipt.errors === undefined ? {} : { errors: sendReceipt.errors }),
          ...(sendReceipt.dependencies === undefined
            ? {}
            : { dependencies: sendReceipt.dependencies }),
          handler: (input) =>
            invokeFunction(sendReceipt, input, {
              clients: { buckets: { receipts: receipts.provider } },
            }),
        },
        retry,
        clients: { buckets: { receipts: receipts.provider } },
        hooks: { onSpanComplete: (span) => jobSpans.push(span) },
      }),
    ),
    (owner) => Effect.promise(() => owner.close()),
  );

/**
 * Owns the receiver's event delivery harness while borrowing its job.
 * @param job - Scope-owned receipt job.
 * @param eventSpans - Borrowed observer receiving completed event spans.
 * @returns A scoped event harness with typed receiver-owned publication.
 */
const receiptEvent = Effect.fn("test.receiptEvent")(function* (
  job: InstrumentationFixture["job"],
  eventSpans: CapturedSpan[],
) {
  const consumer = defineEventFunction({
    id: "orders.queue-receipt",
    event: "orders.created",
    handler: async (input) => {
      await job.enqueue(input);
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

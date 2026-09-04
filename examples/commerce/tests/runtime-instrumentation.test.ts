import { expect, test } from "bun:test";
import { defineEventFunction } from "@relkit/app/events";
import {
  createTestBucketFake,
  createTestEvent,
  createTestJob,
  type TestFailureControls,
} from "@relkit/testing";
import sendReceipt from "../src/receipts/functions/send-receipt.function.js";

type CapturedSpan = {
  readonly name: string;
  readonly traceId: string;
  readonly links?: readonly { readonly traceId: string; readonly spanId: string }[];
};

const retry = {
  maxAttempts: 2,
  initialDelayMs: 10,
  maxDelayMs: 10,
  multiplier: 1,
  jitter: "none" as const,
};

test("links an event continuation to a retrying receipt job", async () => {
  let failReceiptWrite = true;
  const failures: TestFailureControls = {
    failAt: () => undefined,
    clear: () => undefined,
    check: (point) => {
      if (point === "bucket.before-write" && failReceiptWrite) {
        failReceiptWrite = false;
        throw new Error("receipt storage unavailable");
      }
    },
  };
  const receipts = createTestBucketFake({ bucketId: "receipts", failures });
  const jobSpans: CapturedSpan[] = [];
  const job = await createTestJob({
    jobId: "receipts.send",
    target: sendReceipt as never,
    retry,
    clients: { buckets: { receipts: receipts.provider } },
    hooks: { onSpanComplete: (span) => jobSpans.push(span) },
  });
  const eventSpans: CapturedSpan[] = [];
  const consumer = defineEventFunction({
    id: "orders.queue-receipt",
    event: "orders.created" as never,
    handler: async (input) => {
      await job.enqueue(input as { orderId: string; receiptKey: string });
    },
  });
  const event = await createTestEvent({
    eventId: "orders.created",
    version: 1,
    target: consumer,
    retry,
    hooks: { onSpanComplete: (span) => eventSpans.push(span) },
  });

  try {
    const published = await event.publish({
      orderId: "order-1",
      receiptKey: "receipts/order-1.json",
    });
    await expect(event.drain()).resolves.toMatchObject([{ state: "completed" }]);

    const queued = job.get("test-job-receipts.send-1");
    expect(published.propagation?.producer.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(queued?.propagation?.producer.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(
      eventSpans
        .at(-1)
        ?.links?.some(
          (link) =>
            link.traceId === published.propagation?.producer.traceId &&
            link.spanId === published.propagation?.producer.spanId,
        ),
    ).toBe(true);

    await expect(job.runNext()).resolves.toMatchObject({
      state: "delayed",
      classification: "retryable",
      attempt: 1,
    });
    await job.clock.advance(10);
    await expect(job.runNext()).resolves.toMatchObject({ state: "completed", attempt: 2 });
    const attempts = jobSpans.filter((span) => span.name.startsWith("relkit.invoke."));
    expect(attempts).toHaveLength(2);
    expect(
      attempts.every(
        (span) =>
          span.links?.some((link) => link.traceId === queued?.propagation?.producer.traceId) ===
          true,
      ),
    ).toBe(true);
    expect(receipts.inspect().map(({ key }) => key)).toEqual(["receipts/order-1.json"]);
  } finally {
    await event.close();
    await job.close();
    await receipts.close();
  }
});

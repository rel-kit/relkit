import { expect, test } from "bun:test";
import {
  createTestBucketFake,
  createTestJob,
  invokeFunction,
  type TestJobOptions,
} from "@relkit/testing";
import sendReceiptJob from "@app/receipts/jobs/send-receipt.job.js";
import queueReceipt from "./fixtures/queue-receipt.function.js";

type ReceiptInput = Parameters<typeof sendReceiptJob.target.invoke>[0];
type ReceiptOutput = Awaited<ReturnType<typeof sendReceiptJob.target.invoke>>;

test("queues a receipt, completes it, and retains duplicate protection after restart", async () => {
  const bucket = createTestBucketFake({ bucketId: "assets.objects", clock: () => 0 });
  const job = await createTestJob({
    jobId: sendReceiptJob.id,
    // The job harness uses a generic context type; the clients below supply the declared bucket.
    target: sendReceiptJob.target as unknown as TestJobOptions<
      ReceiptInput,
      ReceiptOutput
    >["target"],
    retry: sendReceiptJob.retry,
    timeoutMs: sendReceiptJob.timeoutMs!,
    concurrency: sendReceiptJob.concurrency!,
    idempotency: sendReceiptJob.idempotency!,
    clients: { buckets: { assets: bucket.provider } },
  });
  const input = { orderId: "order-1", receiptKey: "receipts/order-1.json" };

  try {
    const acceptance = await invokeFunction(queueReceipt, input, {
      clients: { jobs: { sendReceiptJob: job.provider } },
    });
    expect(acceptance.accepted).toBe(true);
    expect(typeof acceptance.instanceId).toBe("string");
    expect(job.status()).toMatchObject({ available: 1, completed: 0 });
    expect(await bucket.read(input.receiptKey)).toBeUndefined();

    expect(await job.drain()).toMatchObject([
      { state: "completed", value: { receiptId: "order-1:receipts/order-1.json" } },
    ]);
    expect(new TextDecoder().decode(await bucket.read(input.receiptKey))).toBe(
      '{"orderId":"order-1"}',
    );

    await job.restart();
    expect(await job.enqueue(input)).toMatchObject({
      instanceId: acceptance.instanceId,
      duplicate: true,
    });
    expect(await job.drain()).toEqual([]);
    expect(job.get(acceptance.instanceId)).toMatchObject({ state: "completed" });
  } finally {
    await Promise.all([job.close(), bucket.close()]);
  }
});

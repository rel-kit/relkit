import { describe, expect, test } from "bun:test";
import { z } from "@zsys/schema";
import { createTestJob } from "./src/index.ts";

const target = {
  id: "orders.send",
  input: z.object({ orderId: z.string() }),
  output: z.object({ sent: z.boolean() }),
  handler: async () => ({ sent: true }),
};

describe("testing job fake", () => {
  test("enqueues, runs, drains, and exposes deterministic state", async () => {
    const job = await createTestJob({
      jobId: "orders.receipt",
      target,
      startTimeMs: 100,
      retry: { maxAttempts: 1, initialDelayMs: 0, maxDelayMs: 0, multiplier: 1, jitter: "none" },
    });
    try {
      await expect(job.enqueue({ orderId: "order-1" })).resolves.toMatchObject({
        accepted: true,
        status: "accepted",
        instanceId: "test-job-orders.receipt-1",
      });
      expect(job.status()).toMatchObject({ accepted: 0, available: 1 });
      await expect(job.drain()).resolves.toMatchObject([
        { state: "completed", value: { sent: true } },
      ]);
      expect(job.status()).toMatchObject({ available: 0, completed: 1 });
    } finally {
      await job.close();
    }
  });

  test("recovers both named acknowledgement gaps after restart", async () => {
    let calls = 0;
    const restartTarget = {
      ...target,
      handler: async () => {
        calls += 1;
        return { sent: true };
      },
    };
    const job = await createTestJob({
      target: restartTarget,
      startTimeMs: 0,
      leaseDurationMs: 10,
      retry: { maxAttempts: 1, initialDelayMs: 0, maxDelayMs: 0, multiplier: 1, jitter: "none" },
    });
    try {
      await job.enqueue({ orderId: "lease" });
      job.failures.once("job.after-lease");
      await expect(job.runNext()).rejects.toThrow("job.after-lease");
      await job.clock.advance(10);
      await job.restart();
      await expect(job.runNext()).resolves.toMatchObject({ state: "completed" });
      expect(calls).toBe(1);

      await job.enqueue({ orderId: "ack" });
      job.failures.once("job.after-handler-success-before-ack");
      await expect(job.runNext()).rejects.toThrow("job.after-handler-success-before-ack");
      await job.clock.advance(10);
      await job.restart();
      await expect(job.runNext()).resolves.toMatchObject({ state: "completed" });
      expect(calls).toBe(3);
    } finally {
      await job.close();
    }
  });

  test("uses the injected random source for retry delay without sleeping", async () => {
    const job = await createTestJob({
      target: {
        ...target,
        handler: async () => ({ sent: true }),
      },
      startTimeMs: 100,
      randomValues: [0.25],
      retry: {
        maxAttempts: 2,
        initialDelayMs: 100,
        maxDelayMs: 100,
        multiplier: 1,
        jitter: "full",
      },
    });
    try {
      await job.enqueue({ orderId: "retry" });
      job.failures.failAt("job.handler.retryable");
      await expect(job.runNext()).resolves.toMatchObject({
        state: "delayed",
        entry: { availableAt: 125 },
      });
      expect(job.status().delayed).toBe(1);
      await job.clock.advance(25);
      await expect(job.runNext()).resolves.toMatchObject({ state: "dead-lettered" });
    } finally {
      await job.close();
    }
  });
});

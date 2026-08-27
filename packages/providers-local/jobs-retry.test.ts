import { afterEach, describe, expect, test } from "bun:test";
import { applicationFailure, cancellationFailure, timeoutFailure } from "@relkit/runtime-effect";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJobQueue } from "./src/jobs/queue.ts";
import { applyRetry, calculateRetryDelay, planRetry } from "./src/jobs/retry.ts";
import { createJobStore } from "./src/jobs/store.ts";

const roots: string[] = [];

describe("local job retry policy", () => {
  test("calculates capped exponential, full, and equal jitter deterministically", () => {
    const policy = {
      maxAttempts: 5,
      initialDelayMs: 100,
      maxDelayMs: 250,
      multiplier: 2,
      jitter: "none" as const,
    };
    expect(calculateRetryDelay(policy, 3)).toBe(250);
    expect(calculateRetryDelay({ ...policy, jitter: "full" }, 2, () => 0.25)).toBe(50);
    expect(calculateRetryDelay({ ...policy, jitter: "equal" }, 2, () => 0.5)).toBe(150);
  });

  test("delays declared retryable failures and dead-letters exhausted attempts safely", async () => {
    const root = await mkdtemp(join(tmpdir(), "relkit-retry-"));
    roots.push(root);
    let now = 100;
    const store = await createJobStore(join(root, "jobs"), { now: () => now });
    const queue = createJobQueue(store, {
      now: () => now,
      ownerToken: "worker-a",
      leaseDurationMs: 1_000,
    });
    await queue.ready();
    await queue.enqueue({ instanceId: "job-1", input: { orderId: "order-1" } });
    await queue.transition("job-1", "available");
    await queue.acquire("job-1");

    const retryable = applicationFailure({
      id: "orders.temporarily-unavailable",
      message: "Try again",
      data: { orderId: "order-1" },
      retry: "later",
      afterMs: 200,
      cause: new Error("password=should-not-persist"),
    });
    const delayed = await applyRetry(
      queue,
      "job-1",
      {
        maxAttempts: 3,
        initialDelayMs: 50,
        maxDelayMs: 100,
        multiplier: 2,
        jitter: "none",
      },
      retryable,
      { now: () => now },
    );
    expect(delayed).toMatchObject({ state: "delayed", attempt: 1, availableAt: 300 });
    expect(delayed.failure).toEqual({
      kind: "application",
      outcome: "declared-error",
      code: "orders.temporarily-unavailable",
      message: "Try again",
      data: { orderId: "order-1" },
      afterMs: 200,
      retry: "later",
    });
    expect(JSON.stringify(delayed)).not.toContain("should-not-persist");

    now = 300;
    await queue.transition("job-1", "available", { availableAt: 300 });
    await queue.acquire("job-1");
    const policyDelayFailure = applicationFailure({
      id: "orders.temporarily-unavailable",
      message: "Try again",
      data: { orderId: "order-1" },
      retry: "later",
      afterMs: 10,
    });
    const policyDelayed = await applyRetry(
      queue,
      "job-1",
      {
        maxAttempts: 3,
        initialDelayMs: 50,
        maxDelayMs: 100,
        multiplier: 2,
        jitter: "none",
      },
      policyDelayFailure,
      { now: () => now },
    );
    expect(policyDelayed).toMatchObject({ state: "delayed", attempt: 2, availableAt: 400 });

    now = 400;
    await queue.transition("job-1", "available", { availableAt: 400 });
    await queue.acquire("job-1");
    const dead = await applyRetry(
      queue,
      "job-1",
      {
        maxAttempts: 3,
        initialDelayMs: 50,
        maxDelayMs: 100,
        multiplier: 2,
        jitter: "none",
      },
      retryable,
      { now: () => now },
    );
    expect(dead.state).toBe("dead-lettered");
    expect(dead.attempt).toBe(3);
    expect(queue.counts()["dead-lettered"]).toBe(1);
    await store.close();
  });

  test("dead-letters a non-retryable declared failure before the limit", () => {
    const omitted = applicationFailure({
      id: "orders.invalid",
      message: "Invalid order",
      data: {},
    });
    expect(
      planRetry(
        {
          maxAttempts: 8,
          initialDelayMs: 10,
          maxDelayMs: 100,
          multiplier: 2,
          jitter: "full",
        },
        1,
        omitted,
      ),
    ).toMatchObject({
      classification: "non-retryable",
      state: "dead-lettered",
      delayMs: 0,
      failure: { retry: "never" },
    });
    expect(
      planRetry(
        {
          maxAttempts: 8,
          initialDelayMs: 10,
          maxDelayMs: 100,
          multiplier: 2,
          jitter: "full",
        },
        1,
        applicationFailure({
          id: "orders.invalid",
          message: "Invalid order",
          data: {},
          retry: "never",
        }),
      ),
    ).toMatchObject({ classification: "non-retryable", state: "dead-lettered", delayMs: 0 });
  });

  test("uses the larger declared delay and preserves deadline/cancellation bounds", () => {
    const policy = {
      maxAttempts: 3,
      initialDelayMs: 50,
      maxDelayMs: 50,
      multiplier: 1,
      jitter: "none" as const,
    };
    expect(
      planRetry(
        policy,
        1,
        applicationFailure({
          id: "orders.retryable",
          message: "Try again",
          data: {},
          retry: "later",
          afterMs: 100,
        }),
      ),
    ).toMatchObject({ state: "delayed", delayMs: 100, failure: { afterMs: 100 } });
    expect(
      planRetry(
        policy,
        1,
        applicationFailure({
          id: "orders.retryable",
          message: "Try again",
          data: {},
          retry: "later",
          afterMs: 10,
        }),
      ).delayMs,
    ).toBe(50);
    expect(
      planRetry(
        policy,
        1,
        applicationFailure({
          id: "orders.retryable",
          message: "Try again",
          data: {},
          retry: "later",
        }),
      ),
    ).toMatchObject({
      classification: "retryable",
      state: "delayed",
      delayMs: 50,
      failure: { retry: "later" },
    });
    expect(planRetry(policy, 1, cancellationFailure()).state).toBe("dead-lettered");
    expect(planRetry(policy, 1, timeoutFailure()).state).toBe("dead-lettered");
    expect(
      planRetry(
        policy,
        3,
        applicationFailure({
          id: "orders.retryable",
          message: "Try again",
          data: {},
          retry: "later",
          afterMs: 100,
        }),
      ),
    ).toMatchObject({ state: "dead-lettered", delayMs: 0 });
  });
});

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

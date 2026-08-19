import { appendFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  createJobClient,
  JobOperationCancelledError,
  type JobProvider,
} from "../../packages/jobs/src/index.ts";
import type { InvocationContext } from "../../packages/engine/src/index.ts";
import type { RetryPolicy } from "../../packages/jobs/src/index.ts";
import {
  type JobIdempotencyDefinition,
  type Scheduler,
} from "../../packages/providers-local/src/index.ts";
import { z } from "../../packages/schema/src/index.ts";
import type { TestJobFake } from "../../packages/testing/src/index.ts";

export interface JobInput {
  readonly orderId: string;
}

export interface JobOutput {
  readonly processed: boolean;
}

export interface JobInvocationObservation {
  readonly input: JobInput;
  readonly source: InvocationContext["invocation"]["source"];
  readonly attempt: number;
}

export interface JobContractCapabilities {
  readonly durable: boolean;
  readonly atLeastOnce: boolean;
  readonly idempotency: boolean;
  readonly schedules: boolean;
  readonly concurrency: boolean;
  readonly restartRecovery: boolean;
  readonly quarantine: boolean;
  readonly cancellation: boolean;
  readonly exactlyOnce: false;
}

export interface JobContractCreateOptions {
  readonly retry?: RetryPolicy;
  readonly idempotency?: JobIdempotencyDefinition;
  readonly leaseDurationMs?: number;
  readonly concurrency?: number;
  readonly consumerConcurrency?: number;
  readonly functionConcurrency?: number;
  readonly startTimeMs?: number;
  readonly handler?: (input: JobInput, context: InvocationContext) => Promise<JobOutput>;
}

export interface JobContractHarness {
  readonly job: TestJobFake<JobInput, JobOutput>;
  readonly invocations: readonly JobInvocationObservation[];
  readonly createScheduler: (now: () => number) => Scheduler;
}

export interface JobContractTarget {
  readonly name: string;
  readonly capabilities: JobContractCapabilities;
  readonly create: (options?: JobContractCreateOptions) => Promise<JobContractHarness>;
}

const inputSchema = z.object({ orderId: z.string() });

export function registerJobContractSuite(target: JobContractTarget): void {
  describe.serial(`job contract: ${target.name}`, () => {
    test("publishes durable at-least-once capabilities without exactly-once claims", () => {
      expect(target.capabilities).toEqual({
        durable: true,
        atLeastOnce: true,
        idempotency: true,
        schedules: true,
        concurrency: true,
        restartRecovery: true,
        quarantine: true,
        cancellation: true,
        exactlyOnce: false,
      });
    });

    test("rejects invalid input before durable acceptance or target invocation", async () => {
      await withJob(target, async ({ job, invocations }) => {
        await expect(job.enqueue({ orderId: 42 } as never)).rejects.toMatchObject({
          code: "ZSYS_JOB_INPUT_VALIDATION",
        });
        expect(job.status()).toMatchObject({
          accepted: 0,
          available: 0,
          leased: 0,
          completed: 0,
          delayed: 0,
          "dead-lettered": 0,
        });
        expect(invocations).toHaveLength(0);
      });
    });

    test("enqueues, consumes through the engine, and acknowledges completion", async () => {
      await withJob(target, async ({ job, invocations }) => {
        const accepted = await job.enqueue({ orderId: "order-1" });
        expect(accepted).toMatchObject({
          accepted: true,
          status: "accepted",
          profile: "default",
        });
        expect(job.status()).toMatchObject({ accepted: 0, available: 1 });

        await expect(job.runNext()).resolves.toMatchObject({
          state: "completed",
          value: { processed: true },
          entry: { state: "completed", attempt: 1 },
        });
        expect(invocations).toEqual([{ input: { orderId: "order-1" }, source: "job", attempt: 1 }]);
        expect(job.status()).toMatchObject({ available: 0, completed: 1 });
      });
    });

    test("uses deterministic retry delay and succeeds on the next attempt", async () => {
      await withJob(
        target,
        async ({ job, invocations }) => {
          await job.enqueue({ orderId: "retry" });
          job.failures.once("job.handler.retryable");

          await expect(job.runNext()).resolves.toMatchObject({
            state: "delayed",
            entry: { attempt: 1, availableAt: 125 },
          });
          await job.clock.advance(24);
          await expect(job.runNext()).resolves.toBeUndefined();
          await job.clock.advance(1);
          await expect(job.runNext()).resolves.toMatchObject({
            state: "completed",
            entry: { attempt: 2 },
          });
          expect(invocations.at(-1)).toMatchObject({ attempt: 2, source: "job" });
        },
        {
          startTimeMs: 100,
          retry: {
            maxAttempts: 2,
            initialDelayMs: 25,
            maxDelayMs: 25,
            multiplier: 1,
            jitter: "none",
          },
        },
      );
    });

    test("dead-letters an exhausted retry with safe failure metadata", async () => {
      await withJob(
        target,
        async ({ job }) => {
          await job.enqueue({ orderId: "dead-letter" });
          job.failures.failAt("job.handler.retryable", new Error("private-cause"));

          await expect(job.runNext()).resolves.toMatchObject({ state: "delayed" });
          await job.clock.advance(10);
          const result = await job.runNext();
          expect(result).toMatchObject({
            state: "dead-lettered",
            entry: { attempt: 2, failure: { retry: "later" } },
          });
          expect(result).not.toHaveProperty("failure.stack");
          expect(result).not.toHaveProperty("failure.cause");
          expect(job.status()).toMatchObject({ "dead-lettered": 1 });
        },
        {
          retry: {
            maxAttempts: 2,
            initialDelayMs: 10,
            maxDelayMs: 10,
            multiplier: 1,
            jitter: "none",
          },
        },
      );
    });

    test("returns an expired lease to available without inventing a state", async () => {
      await withJob(
        target,
        async ({ job }) => {
          await job.enqueue({ orderId: "lease" });
          job.failures.once("job.after-lease");
          await expect(job.runNext()).rejects.toThrow("job.after-lease");
          expect(job.status()).toMatchObject({ leased: 1 });

          await job.clock.advance(10);
          await job.restart();
          expect(job.status()).toMatchObject({ available: 1, leased: 0 });
          expect(Object.keys(job.status())).not.toContain("recovered");
          await expect(job.runNext()).resolves.toMatchObject({ state: "completed" });
        },
        { leaseDurationMs: 10 },
      );
    });

    test("makes acknowledgement-gap duplicates visible after lease recovery", async () => {
      await withJob(
        target,
        async ({ job, invocations }) => {
          await job.enqueue({ orderId: "duplicate" });
          job.failures.once("job.after-handler-success-before-ack");
          await expect(job.runNext()).rejects.toThrow("job.after-handler-success-before-ack");
          expect(invocations).toHaveLength(1);

          await job.clock.advance(10);
          await job.restart();
          await expect(job.runNext()).resolves.toMatchObject({ state: "completed" });
          expect(invocations).toHaveLength(2);
        },
        { leaseDurationMs: 10 },
      );
    });

    test("retains idempotency keys, returns duplicates, and accepts after expiry", async () => {
      await withJob(
        target,
        async ({ job }) => {
          const first = await job.enqueue({ orderId: "retained" });
          await job.restart();
          const duplicate = await job.enqueue({ orderId: "retained" });
          expect(duplicate).toMatchObject({
            duplicate: true,
            instanceId: first.instanceId,
            idempotencyKey: "retained",
            idempotencyExpiresAt: 110,
          });
          expect(job.status()).toMatchObject({ available: 1 });

          await job.clock.advance(10);
          const fresh = await job.enqueue({ orderId: "retained" });
          expect(fresh).toMatchObject({ duplicate: false, idempotencyExpiresAt: 120 });
          expect(fresh.instanceId).not.toBe(first.instanceId);
          expect(job.status()).toMatchObject({ available: 2 });
        },
        {
          startTimeMs: 100,
          idempotency: { key: "orderId", retentionMs: 10 },
        },
      );
    });

    test("enforces the stricter function and consumer concurrency limit", async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let firstStarted!: () => void;
      const started = new Promise<void>((resolve) => {
        firstStarted = resolve;
      });
      let calls = 0;

      await withJob(
        target,
        async ({ job, invocations }) => {
          const first = await job.enqueue({ orderId: "one" });
          const second = await job.enqueue({ orderId: "two" });
          const firstRun = job.runNext(first.instanceId);
          await started;
          const secondRun = job.runNext(second.instanceId);
          await Promise.resolve();
          expect(calls).toBe(1);
          expect(invocations).toHaveLength(1);
          release();
          await expect(Promise.all([firstRun, secondRun])).resolves.toHaveLength(2);
          expect(invocations).toHaveLength(2);
        },
        {
          concurrency: 2,
          consumerConcurrency: 2,
          functionConcurrency: 1,
          handler: async () => {
            calls += 1;
            if (calls === 1) {
              firstStarted();
              await gate;
            }
            return { processed: true };
          },
        },
      );
    });

    test("fires schedules through enqueue and applies skip/allow overlap policies", async () => {
      const start = Date.UTC(2026, 7, 14, 0, 0);
      await withJob(
        target,
        async ({ job, createScheduler }) => {
          const scheduler = createScheduler(() => start);
          scheduler.register(
            {
              id: "minute",
              cron: "* * * * *",
              timezone: "UTC",
              input: { orderId: "scheduled" },
              overlap: "skip",
            },
            (input) => job.enqueue(input as JobInput),
          );
          const runs = await scheduler.tick(start + 60_000);
          expect(runs).toMatchObject([{ scheduleId: "minute", status: "enqueued" }]);
          await expect(job.drain()).resolves.toMatchObject([{ state: "completed" }]);

          let releaseSkip!: () => void;
          const skipGate = new Promise<void>((resolve) => {
            releaseSkip = resolve;
          });
          let skipStarted!: () => void;
          const skipStart = new Promise<void>((resolve) => {
            skipStarted = resolve;
          });
          const skip = createScheduler(() => start);
          skip.register(
            { id: "skip", cron: "* * * * *", timezone: "UTC", input: null, overlap: "skip" },
            async () => {
              skipStarted();
              await skipGate;
            },
          );
          const firstSkip = skip.tick(start + 60_000);
          await skipStarted;
          await expect(skip.tick(start + 120_000)).resolves.toMatchObject([
            { scheduleId: "skip", status: "skipped" },
          ]);
          releaseSkip();
          await firstSkip;

          let releaseAllow!: () => void;
          const allowGate = new Promise<void>((resolve) => {
            releaseAllow = resolve;
          });
          let allowCalls = 0;
          const allow = createScheduler(() => start);
          allow.register(
            { id: "allow", cron: "* * * * *", timezone: "UTC", input: null, overlap: "allow" },
            async () => {
              allowCalls += 1;
              await allowGate;
            },
          );
          const firstAllow = allow.tick(start + 60_000);
          await Promise.resolve();
          const secondAllow = allow.tick(start + 120_000);
          await Promise.resolve();
          expect(allowCalls).toBe(2);
          releaseAllow();
          await Promise.all([firstAllow, secondAllow]);
        },
        { startTimeMs: start },
      );
    });

    test("recovers delayed state and completed state across a restart", async () => {
      await withJob(
        target,
        async ({ job }) => {
          await job.enqueue({ orderId: "restart" });
          job.failures.once("job.handler.retryable");
          await expect(job.runNext()).resolves.toMatchObject({ state: "delayed" });
          await job.restart();
          expect(job.status()).toMatchObject({ delayed: 1 });
          await job.clock.advance(15);
          await expect(job.runNext()).resolves.toMatchObject({ state: "completed" });
          await job.restart();
          expect(job.status()).toMatchObject({ completed: 1 });
        },
        {
          retry: {
            maxAttempts: 2,
            initialDelayMs: 15,
            maxDelayMs: 15,
            multiplier: 1,
            jitter: "none",
          },
        },
      );
    });

    test("quarantines malformed durable records while preserving valid work", async () => {
      await withJob(target, async ({ job }) => {
        await job.enqueue({ orderId: "quarantine" });
        const root = join(job.stateRoot, "jobs", encodeURIComponent(job.id));
        await appendFile(join(root, "records.ndjson"), "not-json\n");
        await job.restart();

        expect(await readdir(join(root, ".zsys-quarantine"))).toHaveLength(1);
        expect(job.status()).toMatchObject({ available: 1 });
        await expect(job.drain()).resolves.toMatchObject([{ state: "completed" }]);
      });
    });

    test("cancels an in-flight enqueue before the provider accepts work", async () => {
      await withJob(target, async ({ job, invocations }) => {
        const controller = new AbortController();
        let providerStarted!: () => void;
        const started = new Promise<void>((resolve) => {
          providerStarted = resolve;
        });
        const provider: JobProvider = {
          enqueue: async (input, request, context) => {
            providerStarted();
            await new Promise<void>((_resolve, reject) => {
              if (context.signal.aborted) {
                reject(context.signal.reason);
                return;
              }
              context.signal.addEventListener(
                "abort",
                () => reject(context.signal.reason ?? new Error("cancelled")),
                { once: true },
              );
            });
            return job.provider.enqueue(input, request, context);
          },
        };
        const client = createJobClient({
          ownerId: "contracts.jobs.owner",
          jobId: job.id,
          source: provider,
          inputSchema,
          signal: () => controller.signal,
        });
        const pending = client.enqueue({ orderId: "cancelled" });
        await started;
        controller.abort(new Error("cancelled"));
        await expect(pending).rejects.toBeInstanceOf(JobOperationCancelledError);
        expect(job.status()).toMatchObject({ available: 0, accepted: 0 });
        expect(invocations).toHaveLength(0);
      });
    });
  });
}

async function withJob(
  target: JobContractTarget,
  run: (harness: JobContractHarness) => Promise<void>,
  options: JobContractCreateOptions = {},
): Promise<void> {
  const harness = await target.create(options);
  try {
    await run(harness);
  } finally {
    await harness.job.close();
  }
}

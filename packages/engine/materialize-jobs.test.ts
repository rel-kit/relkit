import { describe, expect, test } from "bun:test";
import { applicationFailure } from "@relkit/runtime-effect";
import type { FunctionNode, JobNode, RegistrationPlan } from "@relkit/graph";
import type { JobQueueEntry } from "@relkit/providers-local";
import type { JobInvocationOptions, JobQueueHandle } from "./src/materialize-jobs.ts";
import { materializeJobs } from "./src/materialize-jobs.ts";

const source = { file: "src/jobs.ts", line: 1, column: 1 } as const;

describe("job materialization", () => {
  test("binds schedules to job enqueue and acknowledges successful invocation", async () => {
    const now = Date.UTC(2026, 0, 1, 8, 59);
    const queue = makeQueue(() => now, "scheduled-1");
    const calls: JobInvocationOptions[] = [];
    const materialized = await materializeJobs({
      plan: plan({ schedule: true }),
      queues: new Map([["orders.send", queue]]),
      consumerConcurrency: 2,
      schedulerOptions: { now: () => now },
      engine: {
        invoke: async (options) => {
          calls.push(options);
          const lease = await options.admit?.({
            functionId: options.functionId,
            source: options.source,
            signal: new AbortController().signal,
          });
          await lease?.release();
          return { accepted: true };
        },
      },
    });

    const fireAt = Date.UTC(2026, 0, 1, 9);
    const runs = await materialized.runDue(fireAt);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ scheduleId: "orders.send.morning", status: "enqueued" });
    const accepted = runs[0]?.result as {
      readonly instanceId: string;
      readonly acceptedAt: number;
    };
    expect(accepted.acceptedAt).toBe(fireAt);
    await queue.transition(accepted.instanceId, "available");

    const result = await materialized.runNext("orders.send");
    expect(result).toMatchObject({ state: "completed", value: { accepted: true } });
    expect(calls[0]).toMatchObject({
      functionId: "orders.run",
      source: "job",
      attempt: 1,
      triggerLimit: 2,
      input: { orderId: "scheduled" },
    });
    expect(queue.get(accepted.instanceId)?.state).toBe("completed");
  });

  test("classifies handler failure and acknowledges the retry transition", async () => {
    const now = 100;
    const queue = makeQueue(() => now, "failed-1");
    const materialized = await materializeJobs({
      plan: plan(),
      queues: new Map([["orders.send", queue]]),
      now: () => now,
      engine: {
        invoke: async () => {
          throw applicationFailure({
            id: "orders.temporarily-unavailable",
            message: "Try again",
            data: { orderId: "failed" },
            retry: "later",
            afterMs: 25,
          });
        },
      },
    });
    const accepted = await materialized.jobs.get("orders.send")?.enqueue({ orderId: "failed" });
    if (accepted === undefined) throw new Error("Job was not materialized");
    await queue.transition(accepted.instanceId, "available");

    const result = await materialized.runNext("orders.send");
    expect(result).toMatchObject({
      state: "delayed",
      classification: "retryable",
      entry: { availableAt: 125 },
      failure: {
        code: "orders.temporarily-unavailable",
        retry: "later",
        afterMs: 25,
      },
    });
    expect(queue.get(accepted.instanceId)?.state).toBe("delayed");
  });
});

function plan(options: { readonly schedule?: boolean } = {}): RegistrationPlan {
  const functionNode: FunctionNode = {
    kind: "function",
    invocationMode: "callable",
    id: "orders.run",
    source,
    input: { kind: "object" },
    output: { kind: "object" },
    concurrency: 4,
  };
  const jobNode: JobNode = {
    kind: "job",
    id: "orders.send",
    source,
    input: { kind: "object" },
    targetFunctionId: "orders.run",
    profile: "default",
    concurrency: 3,
    retry: {
      maxAttempts: 2,
      initialDelayMs: 10,
      maxDelayMs: 10,
      multiplier: 1,
      jitter: "none",
    },
  };
  return {
    graphHash: "sha256:jobs",
    functions: [functionNode],
    httpTriggers: [],
    queues: [jobNode],
    schedules: options.schedule
      ? [
          {
            id: "orders.send:morning",
            source,
            jobId: "orders.send",
            schedule: {
              id: "morning",
              cron: "0 9 * * *",
              timezone: "UTC",
              input: { orderId: "scheduled" },
              overlap: "skip",
            },
          },
        ]
      : [],
    eventTriggers: [],
    buckets: [],
    caches: [],
    tools: [],
    agents: [],
  };
}

function makeQueue(now: () => number, instanceId: string): JobQueueHandle {
  let entry: JobQueueEntry | undefined;
  const current = (id: string): JobQueueEntry => {
    if (entry === undefined || entry.instanceId !== id) throw new Error(`Unknown job ${id}`);
    return entry;
  };
  return {
    ready: async () => undefined,
    enqueue: async (input) => {
      if (entry !== undefined) throw new Error("Queue already contains the test job");
      entry = {
        instanceId: input.instanceId ?? instanceId,
        state: "accepted",
        input: input.input,
        profile: input.profile ?? "default",
        attempt: 0,
        acceptedAt: input.acceptedAt ?? now(),
        order: 1,
      };
      return { ...entry, accepted: true, duplicate: false };
    },
    acquire: async (id = instanceId) => {
      const prior = current(id);
      if (prior.state !== "available") throw new Error(`Job ${id} is not available`);
      entry = { ...prior, state: "leased", attempt: prior.attempt + 1 };
      return entry;
    },
    transition: async (id, state, options = {}) => {
      const prior = current(id);
      if (options.expectedState !== undefined && prior.state !== options.expectedState)
        throw new Error(`Job ${id} is not ${options.expectedState}`);
      const next: JobQueueEntry = {
        ...prior,
        state,
        ...(options.availableAt === undefined ? {} : { availableAt: options.availableAt }),
        ...(options.failure === undefined ? {} : { failure: options.failure }),
      };
      entry = next;
      return next;
    },
    get: (id) => (entry?.instanceId === id ? entry : undefined),
  };
}

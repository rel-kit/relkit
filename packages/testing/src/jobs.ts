import { join } from "node:path";
import { normalizeId, type JsonValue } from "@relkit/contracts";
import type { JobQueueHandle } from "@relkit/engine";
import { materializeJobs } from "@relkit/engine";
import { createJobClient, type JobClient, type JobProvider } from "@relkit/jobs";
import {
  createJobAdmin,
  createJobQueue,
  createJobStore,
  type JobAdmin,
  type JobQueue,
} from "@relkit/providers-local";
import type { InvocationRunner } from "@relkit/runtime-effect";
import { createDeterministicClock } from "./runtime-clock.js";
import { createTestStateRoot } from "./state-root.js";
import type { TestJobCloseOptions, TestJobFake, TestJobOptions } from "./jobs-types.js";
import {
  createFailures,
  createIdSource,
  createJobInvoker,
  createPlan,
  createRandom,
  defaultRetry,
} from "./jobs-utils.js";

/** Creates a durable, one-job harness using deterministic IDs, time, and retry randomness. */
export async function createTestJobFake<Input = JsonValue, Output = unknown>(
  options: TestJobOptions<Input, Output>,
): Promise<TestJobFake<Input, Output>> {
  const jobId = normalizeId(options.jobId ?? options.target.id);
  const profile = normalizeId(options.profile ?? "default");
  const retry = options.retry ?? defaultRetry;
  const owner = createTestStateRoot(options.stateRoot);
  const deterministic = createDeterministicClock(options.startTimeMs ?? 0);
  const runner: InvocationRunner = {
    run: (effect, runOptions) => deterministic.run(effect, runOptions),
  };
  const failures = options.failures ?? createFailures();
  const random = createRandom(options.random, options.randomValues);
  const idSource = createIdSource();
  const plan = createPlan(jobId, options.target, retry, profile, options);
  let generation = 0;
  let instanceSequence = 0;
  let store!: Awaited<ReturnType<typeof createJobStore>>;
  let queue!: JobQueue;
  let admin!: JobAdmin;
  let materialized!: Awaited<ReturnType<typeof materializeJobs>>;
  let closed = false;
  const invokeJob = createJobInvoker(
    options.target,
    failures,
    runner,
    idSource,
    deterministic.clock.currentTimeMs,
    options.env,
    options.clients,
    options.hooks,
  );

  const provider: JobProvider = {
    enqueue: async (input, _request, context) => {
      if (context.signal.aborted) throw new Error("Job operation cancelled");
      const accepted = await queue.enqueue({
        input: input as JsonValue,
        profile,
        ...(context.propagation === undefined ? {} : { propagation: context.propagation }),
      });
      if (!accepted.duplicate) {
        await queue.transition(accepted.instanceId, "available", { expectedState: "accepted" });
      }
      return accepted;
    },
  };
  const client = createJobClient({
    ownerId: normalizeId(options.ownerId ?? jobId),
    jobId,
    source: provider,
    inputSchema: options.target.input,
    profile,
  }) as JobClient<Input>;

  await open();
  return Object.freeze({
    ...client,
    id: jobId,
    client,
    provider,
    stateRoot: owner.path,
    clock: deterministic.clock,
    random,
    failures,
    get admin(): JobAdmin {
      return admin;
    },
    status: () => queue.counts(),
    get: (instanceId: string) => queue.get(instanceId),
    runNext,
    drain,
    restart,
    close,
  });

  async function open(): Promise<void> {
    store = await createJobStore(join(owner.path, "jobs", encodeURIComponent(jobId)), {
      now: deterministic.clock.currentTimeMs,
    });
    queue = createJobQueue(store, {
      now: deterministic.clock.currentTimeMs,
      ownerToken: `test-job-owner-${++generation}`,
      createInstanceId: () => `test-job-${jobId}-${++instanceSequence}`,
      ...(options.leaseDurationMs === undefined
        ? {}
        : { leaseDurationMs: options.leaseDurationMs }),
      ...(options.idempotency === undefined ? {} : { idempotency: options.idempotency }),
    });
    await queue.ready();
    admin = createJobAdmin(queue, {
      mode: "test",
      now: deterministic.clock.currentTimeMs,
      createActionId: () => `test-job-action-${jobId}-${generation}`,
    });
    const handle: JobQueueHandle = {
      ...queue,
      acquire: async (instanceId, leaseOptions) => {
        const leased = await queue.acquire(instanceId, leaseOptions);
        if (leased !== undefined) failures.check("job.after-lease");
        return leased;
      },
      transition: async (instanceId, state, transitionOptions) => {
        if (state === "completed") failures.check("job.after-handler-success-before-ack");
        return queue.transition(instanceId, state, transitionOptions);
      },
    };
    materialized = await materializeJobs({
      plan,
      queues: new Map([[jobId, handle]]),
      engine: {
        invoke: (request) => invokeJob(request),
      },
      now: deterministic.clock.currentTimeMs,
      random,
      ...(options.consumerConcurrency === undefined
        ? {}
        : { consumerConcurrency: options.consumerConcurrency }),
    });
  }

  async function runNext(instanceId?: string) {
    ensureOpen();
    await promoteDue();
    return instanceId === undefined
      ? materialized.runNext(jobId)
      : materialized.runNext(jobId, instanceId);
  }

  async function drain() {
    ensureOpen();
    const results: import("@relkit/engine").JobRunResult[] = [];
    while (true) {
      await promoteDue();
      const next = queue.selectAvailable(1, deterministic.clock.currentTimeMs())[0];
      if (next === undefined) return Object.freeze(results);
      const result = await materialized.runNext(jobId, next.instanceId);
      if (result === undefined) return Object.freeze(results);
      results.push(result);
    }
  }

  async function promoteDue(): Promise<void> {
    const now = deterministic.clock.currentTimeMs();
    for (const entry of queue.snapshot()) {
      if (entry.state === "delayed" && (entry.availableAt ?? Number.MAX_SAFE_INTEGER) <= now) {
        await queue.transition(entry.instanceId, "available", {
          expectedState: "delayed",
          availableAt: now,
        });
      }
    }
  }

  async function restart(): Promise<void> {
    ensureOpen();
    await store.close();
    await open();
  }

  async function close(closeOptions: TestJobCloseOptions = {}): Promise<void> {
    if (closed) return;
    closed = true;
    await store.close();
    owner.cleanup(closeOptions.failed === true);
  }

  function ensureOpen(): void {
    if (closed) throw new Error("Test job is closed");
  }
}

export const createTestJob = createTestJobFake;

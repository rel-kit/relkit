import {
  invoke,
  materializeJobs,
  type DependencyClientSources,
  type InvocationHooks,
  type InvocationIdSource,
  type InvocationTarget,
  type JobInvocationOptions,
} from "@zsys/engine";
import type { ProtocolId } from "@zsys/contracts";
import type { RetryPolicy } from "@zsys/jobs";
import { applicationFailure } from "@zsys/runtime-effect";
import type { InvocationRunner } from "@zsys/runtime-effect";
import type { TestFailureControls } from "./fakes.js";
import type { TestJobOptions } from "./jobs-types.js";

export const defaultRetry: RetryPolicy = Object.freeze({
  maxAttempts: 1,
  initialDelayMs: 0,
  maxDelayMs: 0,
  multiplier: 1,
  jitter: "none",
});

export function createPlan<Input, Output>(
  jobId: string,
  target: InvocationTarget<Input, Output>,
  retry: RetryPolicy,
  profile: string,
  options: TestJobOptions<Input, Output>,
): Parameters<typeof materializeJobs>[0]["plan"] {
  return {
    graphHash: "sha256:test-job",
    functions: [{ id: target.id, concurrency: target.concurrency }],
    queues: [
      {
        kind: "job",
        id: jobId,
        targetFunctionId: target.id,
        profile,
        retry,
        ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
        ...(options.concurrency === undefined ? {} : { concurrency: options.concurrency }),
        ...(options.idempotency === undefined ? {} : { idempotency: options.idempotency }),
      },
    ],
    httpTriggers: [],
    schedules: [],
    eventTriggers: [],
    buckets: [],
    caches: [],
    tools: [],
    agents: [],
  } as unknown as Parameters<typeof materializeJobs>[0]["plan"];
}

export function createJobInvoker<Input, Output>(
  target: InvocationTarget<Input, Output>,
  failures: TestFailureControls,
  runner: InvocationRunner,
  idSource: InvocationIdSource,
  now: () => number,
  env: Readonly<Record<string, unknown>> | undefined,
  clients: DependencyClientSources | undefined,
  hooks: InvocationHooks | undefined,
): (request: JobInvocationOptions) => Promise<unknown> {
  return async (request) => {
    try {
      failures.check("job.handler.retryable");
    } catch (cause) {
      throw applicationFailure({
        id: "test.job.retryable",
        message: cause instanceof Error ? cause.message : "Injected retryable job failure",
        data: null,
        retry: "later",
        cause,
      });
    }
    return invoke({
      target,
      input: request.input,
      source: "job",
      attempt: request.attempt,
      ...(request.triggerLimit === undefined ? {} : { triggerLimit: request.triggerLimit }),
      ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
      ...(request.admit === undefined ? {} : { admit: request.admit }),
      ...(env === undefined ? {} : { env }),
      ...(clients === undefined ? {} : { clients }),
      ...(hooks === undefined ? {} : { hooks }),
      now,
      effectRunner: runner,
      idSource,
    });
  };
}

export function createIdSource(): InvocationIdSource {
  let sequence = 0;
  return { next: (kind) => `test-${kind}-${++sequence}` as ProtocolId };
}

export function createRandom(
  source: (() => number) | undefined,
  values: readonly number[] | undefined,
) {
  if (source !== undefined) return source;
  const sequence = values?.map((value) => {
    if (!Number.isFinite(value) || value < 0 || value >= 1)
      throw new TypeError("Test job randomness must be in [0, 1)");
    return value;
  });
  let index = 0;
  return () => sequence?.[index++] ?? 0.5;
}

export function createFailures(): TestFailureControls {
  const configured = new Map<string, { readonly cause: unknown; readonly once: boolean }>();
  return Object.freeze({
    failAt: (point: string, cause?: unknown) => set(point, cause, false),
    once: (point: string, cause?: unknown) => set(point, cause, true),
    clear: (point?: string) =>
      point === undefined ? configured.clear() : configured.delete(point),
    check: (point: string) => {
      const failure = configured.get(point);
      if (failure === undefined) return;
      if (failure.once) configured.delete(point);
      throw failure.cause instanceof Error
        ? failure.cause
        : new Error(`Injected test failure: ${point}`);
    },
  });

  function set(point: string, cause: unknown, once: boolean): void {
    if (point.trim() === "") throw new TypeError("Failure point must not be empty");
    configured.set(point, { cause: cause ?? new Error(`Injected test failure: ${point}`), once });
  }
}

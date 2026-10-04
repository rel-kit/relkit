import { createTestIdentitySource } from "./identity.js";
import {
  invoke,
  materializeJobs,
  type DependencyClientSources,
  type InvocationHooks,
  type InvocationIdSource,
  type InvocationTarget,
  type JobInvocationOptions,
} from "@relkit/engine";

import type { RetryPolicy } from "@relkit/jobs/legacy";
import { applicationFailure } from "@relkit/runtime-effect";
import type { InvocationRunner } from "@relkit/runtime-effect";
import type { TestFailureControls } from "./fakes.js";
import type { TestJobOptions } from "./jobs-types.js";
import { combineSignals } from "./runtime-clock.js";

export const defaultRetry: RetryPolicy = Object.freeze({
  maxAttempts: 1,
  initialDelayMs: 0,
  maxDelayMs: 0,
  multiplier: 1,
  jitter: "none",
});

/**
 * Builds the minimal registration plan consumed by native materialization.
 * @typeParam Input - Input accepted by the target's native schema.
 * @typeParam Output - Output validated by the target's native schema.
 * @param jobId - Native logical job identity.
 * @param target - Native target descriptor retaining validation and dependency contracts.
 * @param retry - Existing native bounded retry policy.
 * @param profile - Native provider profile identity.
 * @param options - Explicit configuration and native dependencies for this test owner.
 * @returns A registration plan preserving retry, concurrency and identity policies.
 */
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
    channels: [],
  } as unknown as Parameters<typeof materializeJobs>[0]["plan"];
}

/**
 * Binds job invocation to deterministic IDs, time and owner cancellation.
 * @typeParam Input - Input accepted by the target's native schema.
 * @typeParam Output - Output validated by the target's native schema.
 * @param target - Native target descriptor retaining validation and dependency contracts.
 * @param failures - Owner-local named failure injection authority.
 * @param runner - Injected Effect invocation runner.
 * @param idSource - Owner-local native identity source.
 * @param now - Injected current time in milliseconds.
 * @param env - Explicit environment values for the native invocation.
 * @param clients - Native clients supplied to this workflow.
 * @param hooks - Caller-native hooks forwarded without changing ordering.
 * @param ownerSignal - Getter for this owner's current cancellation generation.
 * @returns The native engine invocation boundary with retryable failure injection.
 */
export function createJobInvoker<Input, Output>(
  target: InvocationTarget<Input, Output>,
  failures: TestFailureControls,
  runner: InvocationRunner,
  idSource: InvocationIdSource,
  now: () => number,
  env: Readonly<Record<string, unknown>> | undefined,
  clients: DependencyClientSources | undefined,
  hooks: InvocationHooks | undefined,
  ownerSignal?: () => AbortSignal,
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
    const signals = combineSignals(request.signal, ownerSignal?.());
    try {
      return await invoke({
        target,
        input: request.input,
        source: "job",
        attempt: request.attempt,
        ...(request.correlationId === undefined ? {} : { correlationId: request.correlationId }),
        ...(request.originRequestId === undefined
          ? {}
          : { originRequestId: request.originRequestId }),
        ...(request.links === undefined ? {} : { links: request.links }),
        ...(request.triggerLimit === undefined ? {} : { triggerLimit: request.triggerLimit }),
        ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
        ...(request.admit === undefined ? {} : { admit: request.admit }),
        ...(env === undefined ? {} : { env }),
        ...(clients === undefined ? {} : { clients }),
        ...(hooks === undefined ? {} : { hooks }),
        now,
        effectRunner: runner,
        idSource,
        signal: signals.signal,
      });
    } finally {
      signals.dispose();
    }
  };
}

/**
 * Creates an isolated monotonically sequenced invocation identity source.
 * @returns A source emitting native trace, span and invocation identity formats.
 */
export function createIdSource(): InvocationIdSource {
  return createTestIdentitySource();
}

/**
 * Creates deterministic retry randomness with upfront fixture validation.
 * @param source - Caller-supplied randomness source, when present.
 * @param values - Finite retry random values in the interval [0, 1).
 * @returns The caller's source or a sequence-backed source defaulting to 0.5.
 */
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

/**
 * Creates isolated named failure injection controls.
 * @returns Controls retaining configured failures and consuming one-shot boundaries once.
 */
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

  /**
   * Registers a named injected failure and its consumption policy.
   * @param point - Named failure boundary used by the owning workflow.
   * @param cause - Original caller-supplied failure value.
   * @param once - Whether the configured failure is consumed on its first check.
   * @returns Nothing; the owner-local failure registry stores the declaration.
   */
  function set(point: string, cause: unknown, once: boolean): void {
    if (point.trim() === "") throw new TypeError("Failure point must not be empty");
    configured.set(point, { cause: cause ?? new Error(`Injected test failure: ${point}`), once });
  }
}

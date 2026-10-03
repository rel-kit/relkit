import { parseTracePropagation, type JsonValue } from "@relkit/contracts";
import {
  completeSpan,
  runDetachedExecution,
  runInExecutionContext,
  startRootSpan,
} from "@relkit/invocation";
import type { JobOperationContext } from "@relkit/jobs/legacy";
import { observeExecution } from "@relkit/runtime-effect";
import { Cause, Effect, Exit, Tracer } from "effect";
import { enginePromise, runEnginePromise } from "./engine-runtime.js";
import type { InvocationAdmit } from "./invoke-types.js";
import { transitionJobFailure } from "./materialize-jobs-retry.js";
import type {
  JobEnqueueOptions,
  JobInvocationOptions,
  JobMaterializationOptions,
  JobPolicy,
  JobQueueEntry,
  JobQueueHandle,
  JobRunResult,
  MaterializedJob,
} from "./materialize-jobs-types.js";

/** Bind native queue acceptance and durable attempt transitions to one validated policy.
 * @returns Queue enqueue and attempt operations sharing one validated policy.
 * @param queue - Native durable queue handle.
 * @param policy - Validated queue retry and idempotency policy.
 * @param admit - Generation-local coordinated admission callback.
 * @param triggerLimit - Optional capacity limit for this trigger.
 * @param options - Explicit configuration and dependencies for this operation.
 */
export function createBinding(
  queue: JobQueueHandle,
  policy: JobPolicy,
  admit: InvocationAdmit,
  triggerLimit: number | undefined,
  options: JobMaterializationOptions,
): MaterializedJob {
  /** Accept a queue entry and make newly accepted work immediately available.
   * @param input - Canonical JSON payload for the queued invocation.
   * @param request - Native acceptance, scheduling and idempotency options.
   * @param context - Producer propagation retained on the durable entry.
   * @returns The accepted entry after its initial availability transition.
   */
  const enqueue = async (
    input: JsonValue,
    request: JobEnqueueOptions = {},
    context?: JobOperationContext,
  ): Promise<JobQueueEntry> => {
    const accepted = await queue.enqueue({
      input,
      profile: policy.profile,
      ...(policy.idempotency === undefined ? {} : { idempotency: policy.idempotency }),
      ...request,
      ...(context?.propagation === undefined ? {} : { propagation: context.propagation }),
    });
    return accepted.state === "accepted"
      ? queue.transition(accepted.instanceId, "available", {
          expectedState: "accepted",
          availableAt: accepted.acceptedAt,
        })
      : accepted;
  };
  /** Lease and execute one entry under its own optional consumer trace.
   * @param instanceId - Specific entry to acquire, or undefined for the next available entry.
   * @returns The persisted attempt outcome, or undefined when no entry can be leased.
   */
  const runNext = async (instanceId?: string): Promise<JobRunResult | undefined> => {
    const leased = await queue.acquire(instanceId);
    if (leased === undefined) return undefined;
    const propagation = parseTracePropagation(leased.propagation);
    /** Execute the leased attempt using the selected consumer trace identity.
     * @param traceId - Optional trace created by this queue's configured span runtime.
     * @returns The invocation result and persisted queue transition.
     */
    const run = (traceId?: string): Promise<JobRunResult> =>
      runEnginePromise(
        runAttemptEffect(queue, policy, admit, triggerLimit, options, leased, propagation, traceId),
      );
    if (options.spanRuntime === undefined) return runDetachedExecution(run);
    return runDetachedExecution(() => {
      const runtime = options.spanRuntime!;
      const span = startRootSpan(runtime, `relkit.job.${policy.jobId}`, "consumer");
      span.attribute("relkit.job.id", policy.jobId);
      span.attribute("relkit.job.instance_id", leased.instanceId);
      span.attribute("relkit.job.attempt", leased.attempt);
      if (propagation !== undefined) {
        span.addLinks([
          {
            span: Tracer.externalSpan({
              traceId: propagation.producer.traceId,
              spanId: propagation.producer.spanId,
              sampled: (propagation.producer.traceFlags & 1) === 1,
            }),
            attributes: {},
          },
        ]);
      }
      return runInExecutionContext(
        {
          span,
          runtime,
          ...(propagation?.originRequestId === undefined
            ? {}
            : { originRequestId: propagation.originRequestId }),
          ...(propagation?.correlationId === undefined
            ? {}
            : { correlationId: propagation.correlationId }),
        },
        async () => {
          let failure: unknown;
          try {
            const result = await run(span.traceId);
            if (result.state !== "completed") failure = result.failure ?? result.state;
            return result;
          } catch (error) {
            failure = error;
            throw error;
          } finally {
            completeSpan(span, failure);
          }
        },
      );
    });
  };
  return Object.freeze({
    id: policy.jobId,
    targetFunctionId: policy.targetFunctionId,
    queue,
    policy,
    enqueue,
    runNext,
  });
}

/** Invoke one leased attempt and persist its completion or retry outcome.
 * @param queue - Durable queue that owns the leased entry.
 * @param policy - Validated invocation and retry policy.
 * @param admit - Coordinated function and trigger admission callback.
 * @param triggerLimit - Optional trigger capacity limit.
 * @param options - Engine, clock, and randomness dependencies.
 * @param leased - Entry acquired for this attempt.
 * @param propagation - Validated producer trace and request context.
 * @param traceId - Trace started by the optional job span runtime.
 * @returns The persisted queue outcome and invocation value or classified failure.
 */
const runAttemptEffect = Effect.fn("Engine.jobs.runAttempt")(
  function* (
    queue: JobQueueHandle,
    policy: JobPolicy,
    admit: InvocationAdmit,
    triggerLimit: number | undefined,
    options: JobMaterializationOptions,
    leased: JobQueueEntry,
    propagation: ReturnType<typeof parseTracePropagation>,
    traceId?: string,
  ) {
    let value: unknown;
    const attempted = yield* Effect.exit(
      Effect.gen(function* () {
        return yield* enginePromise(() =>
          Promise.resolve(
            options.engine.invoke({
              functionId: policy.targetFunctionId,
              input: leased.input,
              source: "job",
              attempt: leased.attempt,
              ...(triggerLimit === undefined ? {} : { triggerLimit }),
              ...(policy.timeoutMs === undefined ? {} : { timeoutMs: policy.timeoutMs }),
              ...({ admit } satisfies Pick<JobInvocationOptions, "admit">),
              ...(propagation?.correlationId === undefined
                ? {}
                : { correlationId: propagation.correlationId }),
              ...(propagation?.originRequestId === undefined
                ? {}
                : { originRequestId: propagation.originRequestId }),
              ...(traceId === undefined ? {} : { traceId }),
              ...(traceId !== undefined || propagation === undefined
                ? {}
                : { links: [propagation.producer] }),
            }),
          ),
        );
      }),
    );
    if (Exit.isFailure(attempted)) {
      const cause = Cause.squash(attempted.cause);
      const failed = yield* enginePromise(() =>
        Promise.resolve(
          transitionJobFailure(queue, leased, policy.retry, cause, {
            ...(options.now === undefined ? {} : { now: options.now }),
            ...(options.random === undefined ? {} : { random: options.random }),
          }),
        ),
      );
      if (failed.entry.state !== "delayed" && failed.entry.state !== "dead-lettered")
        return yield* Effect.fail(new Error("Retry did not produce a terminal queue outcome"));
      return {
        instanceId: leased.instanceId,
        attempt: leased.attempt,
        state: failed.entry.state,
        entry: failed.entry,
        classification: failed.classification,
        failure: failed.failure,
      };
    }
    value = attempted.value;
    const entry = yield* enginePromise(() =>
      queue.transition(leased.instanceId, "completed", {
        expectedState: "leased",
      }),
    );
    return {
      instanceId: leased.instanceId,
      attempt: leased.attempt,
      state: "completed" as const,
      entry,
      value,
    };
  },
  (effect) => observeExecution("engine", "jobs.runAttempt", effect),
);

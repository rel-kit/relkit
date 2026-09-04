import { parseTracePropagation, type JsonValue } from "@relkit/contracts";
import {
  completeSpan,
  runDetachedExecution,
  runInExecutionContext,
  startRootSpan,
} from "@relkit/invocation";
import type { JobOperationContext } from "@relkit/jobs";
import { Tracer } from "effect";
import type { InvocationAdmit } from "./invoke-types.js";
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
import { transitionJobFailure } from "./materialize-jobs-retry.js";

export function createBinding(
  queue: JobQueueHandle,
  policy: JobPolicy,
  admit: InvocationAdmit,
  triggerLimit: number | undefined,
  options: JobMaterializationOptions,
): MaterializedJob {
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
  const runNext = async (instanceId?: string): Promise<JobRunResult | undefined> => {
    const leased = await queue.acquire(instanceId);
    if (leased === undefined) return undefined;
    const propagation = parseTracePropagation(leased.propagation);
    const run = (traceId?: string) =>
      runAttempt(queue, policy, admit, triggerLimit, options, leased, propagation, traceId);
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

async function runAttempt(
  queue: JobQueueHandle,
  policy: JobPolicy,
  admit: InvocationAdmit,
  triggerLimit: number | undefined,
  options: JobMaterializationOptions,
  leased: JobQueueEntry,
  propagation: ReturnType<typeof parseTracePropagation>,
  traceId?: string,
): Promise<JobRunResult> {
  let value: unknown;
  try {
    value = await options.engine.invoke({
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
    });
  } catch (cause) {
    const failed = await transitionJobFailure(queue, leased, policy.retry, cause, {
      ...(options.now === undefined ? {} : { now: options.now }),
      ...(options.random === undefined ? {} : { random: options.random }),
    });
    if (failed.entry.state !== "delayed" && failed.entry.state !== "dead-lettered")
      throw new Error("Retry did not produce a terminal queue outcome");
    return {
      instanceId: leased.instanceId,
      attempt: leased.attempt,
      state: failed.entry.state,
      entry: failed.entry,
      classification: failed.classification,
      failure: failed.failure,
    };
  }
  const entry = await queue.transition(leased.instanceId, "completed", {
    expectedState: "leased",
  });
  return {
    instanceId: leased.instanceId,
    attempt: leased.attempt,
    state: "completed",
    entry,
    value,
  };
}

import {
  applyRetry,
  classifyFailure,
  safeFailureMetadata,
  type JobQueueEntry,
} from "@relkit/providers-local";
import type { JsonValue } from "@relkit/contracts";
import type { InvocationAdmit } from "./invoke-types.js";
import type {
  JobEnqueueOptions,
  JobInvocationOptions,
  JobMaterializationOptions,
  JobPolicy,
  JobQueueHandle,
  JobRunResult,
  MaterializedJob,
} from "./materialize-jobs.js";

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
  ): Promise<JobQueueEntry> => {
    const accepted = await queue.enqueue({
      input,
      profile: policy.profile,
      ...(policy.idempotency === undefined ? {} : { idempotency: policy.idempotency }),
      ...request,
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
      });
    } catch (cause) {
      const entry = await applyRetry(queue, leased.instanceId, policy.retry, cause, {
        ...(options.now === undefined ? {} : { now: options.now }),
        ...(options.random === undefined ? {} : { random: options.random }),
      });
      if (entry.state !== "delayed" && entry.state !== "dead-lettered")
        throw new Error("Retry did not produce a terminal queue outcome");
      return {
        instanceId: leased.instanceId,
        attempt: leased.attempt,
        state: entry.state,
        entry,
        classification: classifyFailure(cause),
        failure: safeFailureMetadata(cause),
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

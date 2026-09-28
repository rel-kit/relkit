import type { JobWireEnvelope } from "@relkit/contracts/jobs";
import { Clock, Context, Effect, Layer, Option, Result } from "effect";
import type { JobDescriptorAny } from "./job.types.js";
import type { JobsRuntime } from "./runtime.js";
import type { TaskDescriptorAny } from "./task-types.js";
import { copyTriggerOptions } from "./trigger-validation.js";
import { decodeJobWireEffect } from "./task-wire.js";
import {
  currentCorrelationEffect,
  currentTaskRunIdEffect,
  explicitOrDerivedKeyEffect,
  hashWireEffect,
  propagationForEffect,
  scheduledTimeEffect,
  boundedKey,
} from "./submission-support.js";
import { stableIdentityTupleEffect } from "./identity.js";
import { JobSubmissionPipelineFailure } from "./submission-failure.js";
import { observeJobs } from "./jobs-observability.js";
import type { SubmissionAdmission, TaskSubmissionMetadata } from "./submission.types.js";
/** Substitutable operation ID generator for admitted submissions.
 * @example const service = yield* AdmissionIdentity;
 */
export class AdmissionIdentity extends Context.Service<
  AdmissionIdentity,
  { readonly next: () => string }
>()("relkit/jobs/AdmissionIdentity") {}
/** Provides deterministic admission operation IDs.
 * @param next - Operation ID generator.
 * @returns A Layer for prepareAdmissionEffect.
 * @example admissionIdentityLayer(() => "operation-1");
 */
export const admissionIdentityLayer = (next: () => string) =>
  Layer.succeed(AdmissionIdentity, { next });
/** Prepares binding, identity, scheduling, and input hash in Effect.
 * @param runtime - Jobs runtime and binding resolver.
 * @param task - Task to submit.
 * @param wire - Validated canonical input envelope.
 * @param copied - Validated trigger options.
 * @param job - Optional selected job.
 * @returns Frozen admission data or JobSubmissionPipelineFailure.
 * @example Effect.runPromise(prepareAdmissionEffect(runtime, task, wire, copied));
 */
export const prepareAdmissionEffect = Effect.fn("Jobs.prepareAdmission")(
  (
    runtime: JobsRuntime,
    task: TaskDescriptorAny,
    wire: JobWireEnvelope,
    copied: ReturnType<typeof copyTriggerOptions>,
    job?: JobDescriptorAny,
  ) =>
    observeJobs(
      "submission.admission",
      Effect.gen(function* () {
        const failure = (cause: unknown) => new JobSubmissionPipelineFailure({ cause });
        const canonicalInput = yield* Effect.mapError(decodeJobWireEffect(wire), (error) =>
          failure(error.cause),
        );
        const selectedJob = (copied.job as JobDescriptorAny | undefined) ?? job;
        const binding = yield* Effect.try({
          try: () => runtime.resolveBinding(task, selectedJob),
          catch: failure,
        });
        const idSource = yield* Effect.serviceOption(AdmissionIdentity);
        const operationId =
          copied.operationId ??
          (yield* Effect.try({
            try: () => (Option.isSome(idSource) ? idSource.value.next() : crypto.randomUUID()),
            catch: failure,
          }));
        const configuredJob = runtime.jobs?.find((candidate) => candidate.ref.id === binding.jobId);
        const admissionJob = selectedJob ?? configuredJob ?? admissionJobFromPolicy(binding.policy);
        const idempotencyKey = yield* Effect.mapError(
          explicitOrDerivedKeyEffect(admissionJob, copied, canonicalInput),
          (error) => failure(error.cause),
        );
        const correlationId =
          copied.correlationId ??
          (yield* Effect.mapError(currentCorrelationEffect(), (error) => failure(error.cause)));
        const propagation = yield* Effect.mapError(propagationForEffect(correlationId), (error) =>
          failure(error.cause),
        );
        const parentRunId = yield* Effect.mapError(currentTaskRunIdEffect(), (error) =>
          failure(error.cause),
        );
        const now = yield* Clock.currentTimeMillis;
        const scheduledFor = yield* Effect.mapError(scheduledTimeEffect(copied, now), (error) =>
          failure(error.cause),
        );
        const inputHash = yield* Effect.mapError(hashWireEffect(wire), (error) =>
          failure(error.cause),
        );
        const acceptanceIdentity = yield* Effect.mapError(
          stableIdentityTupleEffect([
            runtime.application,
            runtime.environment,
            runtime.scope,
            binding.jobId,
            binding.taskId,
            binding.taskVersion,
            binding.buildId,
            idempotencyKey ?? operationId,
          ]),
          failure,
        );
        const metadata: TaskSubmissionMetadata = {
          operationId,
          ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
          ...(scheduledFor === undefined ? {} : { scheduledFor }),
          ...(copied.tags === undefined ? {} : { tags: copied.tags }),
          ...(correlationId === undefined ? {} : { correlationId }),
          ...(parentRunId === undefined ? {} : { parentRunId }),
          ...(propagation === undefined ? {} : { propagation }),
          acceptanceIdentity,
          ...(binding.inputSchemaHash === undefined
            ? {}
            : { inputSchemaHash: binding.inputSchemaHash }),
        };
        return Object.freeze({
          task,
          ...(selectedJob === undefined ? {} : { job: selectedJob }),
          binding,
          input: canonicalInput === undefined ? null : canonicalInput,
          canonicalInput,
          inputHash,
          metadata,
        });
      }),
    ),
);
/** Promise compatibility admission preparation.
 * @param runtime - Jobs runtime and binding resolver.
 * @param task - Task to submit.
 * @param wire - Validated canonical input envelope.
 * @param copied - Validated trigger options.
 * @param job - Optional selected job.
 * @returns Frozen admission data.
 * @throws Original binding, validation, or hashing error.
 * @example await prepareAdmission(runtime, task, wire, copied);
 */
export async function prepareAdmission(
  runtime: JobsRuntime,
  task: TaskDescriptorAny,
  wire: JobWireEnvelope,
  copied: ReturnType<typeof copyTriggerOptions>,
  job?: JobDescriptorAny,
): Promise<SubmissionAdmission> {
  const result = await Effect.runPromise(
    Effect.result(prepareAdmissionEffect(runtime, task, wire, copied, job)),
  );
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}
function admissionJobFromPolicy(policy: unknown): JobDescriptorAny | undefined {
  if (policy === null || typeof policy !== "object" || Array.isArray(policy)) return undefined;
  const admission = (policy as Record<string, unknown>).admission;
  if (admission === null || typeof admission !== "object" || Array.isArray(admission))
    return undefined;
  return { admission } as JobDescriptorAny;
}
export { boundedKey };

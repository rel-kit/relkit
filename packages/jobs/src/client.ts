import { normalizeId } from "@relkit/contracts";
import { currentTracePropagation, frameworkTrace } from "@relkit/invocation";
import type { JobEnqueueOptions, JobEnqueueResult } from "@relkit/functions";
import { Effect, Result, Schema } from "effect";
import { observeJobs } from "./jobs-observability.js";
import {
  assertOptions,
  assertOptionalText,
  normalizeResult,
  notify,
  parseInput,
  resolveCorrelation,
  resolveProvider,
  runAbortable,
} from "./client-utils.js";
export type { JobEnqueueOptions, JobEnqueueResult, JobState, JobStatus } from "@relkit/functions";
export type {
  JobOperationContext,
  JobProvider,
  JobProviderResult,
  JobInvocationBridgeOptions,
  JobInvocationBridge,
  JobDeclaredEdge,
  JobObservedEdge,
  JobClientOptions,
  JobClient,
  EffectJobClient,
} from "./client.types.js";
export {
  JobInputValidationError,
  JobProfileError,
  JobProviderError,
  JobDependencyError,
  JobOperationCancelledError,
  JobOperationTimeoutError,
} from "./client-errors.js";
import type {
  JobClientOptions,
  JobProvider,
  EffectJobClient,
  JobClientState,
} from "./client.types.js";
import { JobDependencyError, JobOperationCancelledError } from "./client-errors.js";
/** Expected client setup or enqueue failure, preserving its original cause.
 * @example if (error instanceof JobClientFailure) console.log(error.message);
 */
export class JobClientFailure extends Schema.TaggedError<JobClientFailure>()("Jobs.ClientFailure", {
  cause: Schema.Defect(),
}) {}
/** Creates a jobs enqueue client in Effect.
 * @param options - Job identity, provider, schema, and tracing hooks.
 * @returns A client with a direct Effect enqueue method or JobClientFailure.
 * @example Effect.runSync(createJobClientEffect(options));
 */
export const createJobClientEffect = Effect.fn("Jobs.createJobClient")(
  (options: JobClientOptions) =>
    observeJobs(
      "client.create",
      Effect.try({
        try: () => createJobClientValue(options),
        catch: (cause) => new JobClientFailure({ cause }),
      }),
    ),
);
/** Synchronous compatibility client factory.
 * @param options - Job identity, provider, schema, and tracing hooks.
 * @returns A frozen client with Promise and Effect enqueue methods.
 * @throws The original invalid profile or provider error.
 * @example createJobClient(options);
 */
export function createJobClient(options: JobClientOptions): EffectJobClient {
  const result = Effect.runSync(Effect.result(createJobClientEffect(options)));
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}
function createJobClientValue(options: JobClientOptions): EffectJobClient {
  const ownerId = normalizeId(options.ownerId);
  const jobId = normalizeId(options.jobId);
  const profile = normalizeId(options.profile ?? "default");
  const declared = options.declared !== false;
  const provider = declared
    ? resolveProvider(options.source, profile, options.resolveProfile)
    : ({} as JobProvider);
  notify(options.onDeclaredEdge, { kind: "enqueues-job", from: ownerId, to: jobId }, declared);
  const state: JobClientState = { options, ownerId, jobId, profile, declared, provider };
  const enqueueEffect = (input: unknown, request: JobEnqueueOptions = {}) =>
    observeJobs(
      "client.enqueue",
      Effect.tryPromise({
        try: (effectSignal) => enqueueValue(state, input, request, effectSignal),
        catch: (cause) => new JobClientFailure({ cause }),
      }),
    );
  const enqueue = async (input: unknown, request: JobEnqueueOptions = {}) => {
    const result = await Effect.runPromise(Effect.result(enqueueEffect(input, request)));
    if (Result.isFailure(result)) throw result.failure.cause;
    return result.success;
  };
  return Object.freeze({ enqueue, enqueueEffect });
}
async function enqueueValue(
  state: JobClientState,
  input: unknown,
  request: JobEnqueueOptions,
  effectSignal: AbortSignal,
): Promise<JobEnqueueResult> {
  const { options, ownerId, jobId, profile, declared, provider } = state;
  assertOptions(request);
  const callerSignal = options.signal?.();
  const signal =
    callerSignal === undefined ? effectSignal : AbortSignal.any([callerSignal, effectSignal]);
  const deadlineMs = options.deadline?.();
  const correlationId = request.correlationId ?? resolveCorrelation(options.correlationId);
  assertOptionalText(correlationId, "correlationId");
  notify(
    options.onObservedEdge,
    { relationship: "enqueues-job", from: ownerId, to: jobId },
    declared,
  );
  const work = async (providerSignal: AbortSignal = signal): Promise<JobEnqueueResult> => {
    if (!declared) throw new JobDependencyError(jobId);
    if (providerSignal.aborted) throw new JobOperationCancelledError();
    const value = await parseInput(options.inputSchema, input);
    const base = currentTracePropagation();
    const propagation =
      base === undefined || correlationId === undefined
        ? base
        : Object.freeze({ ...base, correlationId });
    const context = Object.freeze({
      operation: "enqueue" as const,
      signal: providerSignal,
      profile,
      ...(deadlineMs === undefined ? {} : { deadlineMs }),
      ...(correlationId === undefined ? {} : { correlationId }),
      ...(propagation === undefined ? {} : { propagation }),
    });
    const result = await provider.enqueue(
      value,
      Object.freeze({ ...request, ...(correlationId === undefined ? {} : { correlationId }) }),
      context,
    );
    return normalizeResult(result, profile, correlationId);
  };
  const bridged = options.bridge?.run(work, {
    name: `relkit.job.${jobId}.enqueue`,
    attributes: { "relkit.job.id": jobId, "relkit.job.profile": profile },
    input,
    signal,
    kind: "producer",
  });
  return bridged === undefined
    ? frameworkTrace.span(
        `relkit.job.${jobId}.enqueue`,
        {
          input,
          kind: "producer",
          attributes: { "relkit.job.id": jobId, "relkit.job.profile": profile },
        },
        () => runAbortable(signal, deadlineMs, work),
      )
    : bridged;
}

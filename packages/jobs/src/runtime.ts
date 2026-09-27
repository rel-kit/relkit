import type { JobRefAny, TaskRefAny } from "@relkit/contracts/jobs";
import { Effect, Result } from "effect";
import {
  assertJobsAdapterRuntimeEffect,
  JobsAdapterValidationError,
  type JobsAdapterRuntime,
} from "./adapter.js";
import {
  JobsCapabilityError,
  JobsCapabilityFailure,
  validateJobsCapabilityReportEffect,
  type JobsCapabilityReport,
} from "./capabilities.js";
import { observeJobs } from "./jobs-observability.js";
import { resolveBinding } from "./runtime-selection.js";
import { JobsRuntimeError } from "./runtime-context.js";
export {
  JobsRuntimeError,
  JobsRuntimeCallbackError,
  currentJobsRuntime,
  currentJobsRuntimeEffect,
  requireJobsRuntime,
  requireJobsRuntimeEffect,
  runInJobsRuntime,
  runInJobsRuntimeEffect,
  runWithJobsRuntime,
  runWithJobsRuntimeEffect,
} from "./runtime-context.js";
import type {
  JobsManifestLike,
  JobsOperationOptions,
  JobsRuntime,
  JobsRuntimeOptions,
  JobsRuntimeBinding,
} from "./runtime.types.js";
export type {
  JobsManifestLike,
  JobsOperationOptions,
  JobsRuntime,
  JobsRuntimeOptions,
  JobsRuntimeBinding,
} from "./runtime.types.js";
/** Creates a validated jobs runtime in Effect.
 * @param options - Provider, manifest, and runtime defaults.
 * @returns A runtime or a tagged runtime, adapter, or capability failure.
 * @example Effect.runSync(createJobsRuntimeEffect({ adapter }));
 */
export const createJobsRuntimeEffect = Effect.fn("Jobs.createRuntime")(
  function* (options: JobsRuntimeOptions) {
    yield* validateManifestEffect(options.manifest);
    const adapter = options.adapter ?? options.providerHandle?.value ?? options.provider;
    const checked = yield* assertJobsAdapterRuntimeEffect(adapter);
    const capabilities = yield* validateJobsCapabilityReportEffect(
      options.capabilities ?? checked.capabilities,
    );
    return makeRuntime(options, checked, capabilities);
  },
  (effect) => observeJobs("runtime.create", effect),
);
/** Synchronously creates a validated jobs runtime.
 * @param options - Provider, manifest, and runtime defaults.
 * @returns A frozen runtime owned by the caller.
 * @throws TypeError or JobsCapabilityError for invalid configuration.
 * @example createJobsRuntime({ adapter });
 */
export function createJobsRuntime(options: JobsRuntimeOptions): JobsRuntime {
  const result = Effect.runSync(Effect.result(createJobsRuntimeEffect(options)));
  if (Result.isSuccess(result)) return result.success;
  const failure = result.failure;
  if (failure instanceof JobsCapabilityFailure)
    throw new JobsCapabilityError(failure.capability, failure.reason);
  if (failure instanceof JobsAdapterValidationError) throw new TypeError(failure.reason);
  throw new TypeError(failure.reason);
}
function makeRuntime(
  options: JobsRuntimeOptions,
  adapter: JobsAdapterRuntime,
  capabilities: JobsCapabilityReport,
): JobsRuntime {
  const runtime = {
    adapter,
    capabilities,
    application: options.application ?? options.manifest?.app ?? "default",
    environment: options.environment ?? options.manifest?.environment ?? "development",
    scope: options.scope ?? "default",
    service: options.service ?? capabilities.service,
    serviceGeneration: options.serviceGeneration ?? "current",
    ...(options.manifest === undefined ? {} : { manifest: options.manifest }),
    ...(options.jobs === undefined ? {} : { jobs: Object.freeze([...options.jobs]) }),
    ...(options.taskExecutor === undefined ? {} : { taskExecutor: options.taskExecutor }),
    ...(options.tasks === undefined ? {} : { tasks: Object.freeze([...options.tasks]) }),
    resolveBinding: (task: TaskRefAny, selector?: JobRefAny) =>
      resolveBinding(task, selector, options),
    operationContext: (context: JobsOperationOptions) =>
      Object.freeze({
        application: runtime.application,
        environment: runtime.environment,
        scope: context.scope ?? runtime.scope,
        service: runtime.service,
        serviceGeneration: runtime.serviceGeneration,
        signal: context.signal,
        ...(context.operationId === undefined ? {} : { operationId: context.operationId }),
        ...(context.deadlineMs === undefined ? {} : { deadlineMs: context.deadlineMs }),
        ...(context.correlationId === undefined ? {} : { correlationId: context.correlationId }),
        ...(context.parentRunId === undefined ? {} : { parentRunId: context.parentRunId }),
        ...(context.propagation === undefined ? {} : { propagation: context.propagation }),
        ...(context.acceptanceIdentity === undefined
          ? {}
          : { acceptanceIdentity: context.acceptanceIdentity }),
        ...(context.occurrenceIdentity === undefined
          ? {}
          : { occurrenceIdentity: context.occurrenceIdentity }),
        ...(context.inputSchemaHash === undefined
          ? {}
          : { inputSchemaHash: context.inputSchemaHash }),
        ...(context.retryOfRunId === undefined ? {} : { retryOfRunId: context.retryOfRunId }),
      }),
    close: closeOnce(adapter),
  } as JobsRuntime;
  return Object.freeze(runtime);
}
function closeOnce(adapter: JobsAdapterRuntime): () => Promise<void> {
  let closed: Promise<void> | undefined;
  return () => {
    closed ??= Promise.resolve().then(() => adapter.close());
    return closed;
  };
}
export type { NativeLocator } from "./adapter.js";
export type { TaskDescriptorAny } from "./task-types.js";
const validateManifestEffect = Effect.fn("Jobs.validateManifest")(
  function* (manifest: JobsManifestLike | undefined) {
    if (manifest === undefined) return;
    if (manifest.protocol !== undefined && manifest.protocol !== "relkit.jobs-manifest") {
      return yield* new JobsRuntimeError({ reason: "Unsupported jobs manifest protocol" });
    }
    if (manifest.version !== undefined && manifest.version !== 1) {
      return yield* new JobsRuntimeError({ reason: "Unsupported jobs manifest version" });
    }
    if (manifest.jobsProtocolVersion !== undefined && manifest.jobsProtocolVersion !== 1) {
      return yield* new JobsRuntimeError({ reason: "Unsupported jobs protocol version" });
    }
  },
  (effect) => observeJobs("runtime.validateManifest", effect),
);

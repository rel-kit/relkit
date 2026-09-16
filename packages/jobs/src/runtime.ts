import { AsyncLocalStorage } from "node:async_hooks";
import type { JobRefAny, TaskRefAny } from "@relkit/contracts/jobs";
import {
  assertJobsAdapterRuntime,
  type JobsAdapterRuntime,
  type NativeLocator,
  type OperationContext,
  type TaskExecutor,
} from "./adapter.js";
import { validateJobsCapabilityReport, type JobsCapabilityReport } from "./capabilities.js";
import type { JobDescriptorAny } from "./job-types.js";
import type { TaskDescriptorAny } from "./task-types.js";
import { resolveBinding } from "./runtime-selection.js";

export interface JobsManifestLike {
  readonly protocol?: string;
  readonly version?: number;
  readonly app?: string;
  readonly environment?: string;
  readonly jobsProtocolVersion?: number;
  readonly tasks?: readonly {
    readonly id: string;
    readonly version?: string;
    readonly buildId?: string;
    readonly schemaHashes?: unknown;
    readonly policy?: unknown;
  }[];
  readonly jobs?: readonly {
    readonly id: string;
    readonly name: string;
    readonly taskId: string;
    readonly taskVersion?: string;
    readonly buildId?: string;
    readonly profile?: string;
    readonly serviceGeneration?: string;
    readonly default?: boolean;
  }[];
}

export interface JobsRuntimeBinding {
  readonly taskId: string;
  readonly taskVersion: string;
  readonly jobId: string;
  readonly name: string;
  readonly profile: string;
  readonly service: string;
  readonly serviceGeneration: string;
  readonly buildId: string;
  readonly inputSchemaHash?: string;
  readonly scope?: string;
  readonly policy?: unknown;
}

export interface JobsRuntimeOptions {
  readonly adapter?: unknown;
  readonly provider?: unknown;
  readonly providerHandle?: { readonly value: unknown };
  readonly capabilities?: JobsCapabilityReport;
  readonly application?: string;
  readonly environment?: string;
  readonly scope?: string;
  readonly service?: string;
  readonly serviceGeneration?: string;
  readonly manifest?: JobsManifestLike;
  readonly jobs?: readonly JobDescriptorAny[];
  readonly taskExecutor?: TaskExecutor;
  readonly tasks?: readonly TaskDescriptorAny[];
}

export type JobsOperationOptions = Pick<OperationContext, "signal"> &
  Partial<Pick<OperationContext, "scope" | "operationId" | "deadlineMs" | "correlationId" | "parentRunId" | "propagation" | "acceptanceIdentity" | "occurrenceIdentity" | "inputSchemaHash" | "retryOfRunId">>;

export interface JobsRuntime {
  readonly adapter: JobsAdapterRuntime;
  readonly capabilities: JobsCapabilityReport;
  readonly application: string;
  readonly environment: string;
  readonly scope: string;
  readonly service: string;
  readonly serviceGeneration: string;
  readonly manifest?: JobsManifestLike;
  readonly jobs?: readonly JobDescriptorAny[];
  readonly taskExecutor?: TaskExecutor;
  readonly tasks?: readonly TaskDescriptorAny[];
  readonly resolveBinding: (
    task: TaskRefAny,
    selector?: JobRefAny,
  ) => JobsRuntimeBinding;
  readonly operationContext: (
    options: JobsOperationOptions,
  ) => OperationContext;
  readonly close: () => Promise<void>;
}

const runtimeStorage = new AsyncLocalStorage<JobsRuntime>();

export function createJobsRuntime(options: JobsRuntimeOptions): JobsRuntime {
  validateManifest(options.manifest);
  const adapter = options.adapter ?? options.providerHandle?.value ?? options.provider;
  assertJobsAdapterRuntime(adapter);
  const capabilities = validateJobsCapabilityReport(options.capabilities ?? adapter.capabilities);
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
        ...(context.acceptanceIdentity === undefined ? {} : { acceptanceIdentity: context.acceptanceIdentity }),
        ...(context.occurrenceIdentity === undefined ? {} : { occurrenceIdentity: context.occurrenceIdentity }),
        ...(context.inputSchemaHash === undefined ? {} : { inputSchemaHash: context.inputSchemaHash }),
        ...(context.retryOfRunId === undefined ? {} : { retryOfRunId: context.retryOfRunId }),
      }),
    close: closeOnce(adapter),
  } as JobsRuntime;
  return Object.freeze(runtime);
}

export function currentJobsRuntime(): JobsRuntime | undefined {
  return runtimeStorage.getStore();
}

export function requireJobsRuntime(): JobsRuntime {
  const runtime = currentJobsRuntime();
  if (runtime === undefined) throw new Error("RELKIT_JOBS_RUNTIME_UNBOUND");
  return runtime;
}

export function runInJobsRuntime<A>(runtime: JobsRuntime, callback: () => A): A {
  return runtimeStorage.run(runtime, callback);
}

export function runWithJobsRuntime<A>(runtime: JobsRuntime, callback: () => A): A {
  return runInJobsRuntime(runtime, callback);
}

function closeOnce(adapter: JobsAdapterRuntime): () => Promise<void> {
  let closed: Promise<void> | undefined;
  return () => {
    closed ??= Promise.resolve().then(() => adapter.close());
    return closed;
  };
}

export type { NativeLocator };
export type { TaskDescriptorAny };

function validateManifest(manifest: JobsManifestLike | undefined): void {
  if (manifest === undefined) return;
  if (manifest.protocol !== undefined && manifest.protocol !== "relkit.jobs-manifest") {
    throw new TypeError("Unsupported jobs manifest protocol");
  }
  if (manifest.version !== undefined && manifest.version !== 1) {
    throw new TypeError("Unsupported jobs manifest version");
  }
  if (manifest.jobsProtocolVersion !== undefined && manifest.jobsProtocolVersion !== 1) {
    throw new TypeError("Unsupported jobs protocol version");
  }
}

import type { JobRefAny, TaskRefAny } from "@relkit/contracts/jobs";
import type {
  JobsAdapterRuntime,
  NativeLocator,
  OperationContext,
  TaskExecutor,
} from "./adapter.js";
import type { JobsCapabilityReport } from "./capabilities.js";
import type { JobDescriptorAny } from "./job.types.js";
import type { TaskDescriptorAny } from "./task-types.js";
/** Minimal manifest fields used to resolve authored jobs and tasks. */
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
/** Resolved task, job, service, and build identity pinned for one run. */
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
/** Provider, manifest, and authored descriptors used to create a jobs runtime. */
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
/** Caller signal and trusted metadata passed to a native jobs operation. */
export type JobsOperationOptions = Pick<OperationContext, "signal"> &
  Partial<
    Pick<
      OperationContext,
      | "scope"
      | "operationId"
      | "deadlineMs"
      | "correlationId"
      | "parentRunId"
      | "propagation"
      | "acceptanceIdentity"
      | "occurrenceIdentity"
      | "inputSchemaHash"
      | "retryOfRunId"
    >
  >;
/** Validated runtime bindings and provider access for job operations. */
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
  readonly resolveBinding: (task: TaskRefAny, selector?: JobRefAny) => JobsRuntimeBinding;
  readonly operationContext: (options: JobsOperationOptions) => OperationContext;
  readonly close: () => Promise<void>;
}

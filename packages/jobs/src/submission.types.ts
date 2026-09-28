import type { JsonValue, TracePropagation } from "@relkit/contracts";
import type { JobWireEnvelope, RunHandle } from "@relkit/contracts/jobs";
import type { JobDescriptorAny } from "./job.types.js";
import type { JobsRuntimeBinding } from "./runtime.js";
import type { TaskDescriptorAny } from "./task-types.js";

/** Task identity, build, and tracing facts sent with a submission. */
export interface TaskSubmissionMetadata {
  readonly operationId: string;
  readonly idempotencyKey?: string;
  readonly scheduledFor?: string;
  readonly tags?: readonly string[];
  readonly correlationId?: string;
  readonly parentRunId?: string;
  readonly propagation?: TracePropagation;
  readonly acceptanceIdentity?: string;
  readonly occurrenceIdentity?: string;
  readonly inputSchemaHash?: string;
  readonly retryOfRunId?: string;
}

/** Options accepted for canonical task submission operations. */
export interface CanonicalTaskSubmissionOptions {
  readonly canonicalInput: JobWireEnvelope;
  readonly operationId: string;
  readonly idempotencyKey?: string;
  readonly signal?: AbortSignal;
  readonly scheduledFor?: string;
  readonly occurrenceIdentity?: string;
  readonly acceptanceIdentity?: string;
  readonly retryOfRunId?: string;
  readonly inputHash?: string;
  readonly inputSchemaHash?: string;
  readonly job?: JobDescriptorAny;
}

/** Prepared admission identity and timing for one submission. */
export interface SubmissionAdmission {
  readonly task: TaskDescriptorAny;
  readonly job?: JobDescriptorAny;
  readonly binding: JobsRuntimeBinding;
  readonly input: JsonValue;
  readonly canonicalInput: JsonValue | undefined;
  readonly inputHash: string;
  readonly metadata: TaskSubmissionMetadata;
}

/** Validated submission stages and their prepared values. */
export interface SubmissionPipeline {
  readonly submitTask: (
    task: TaskDescriptorAny,
    input: unknown,
    options?: unknown,
  ) => Promise<RunHandle>;
  readonly submitJob: (
    job: JobDescriptorAny,
    input: unknown,
    options?: unknown,
  ) => Promise<RunHandle>;
}

import type { JobRefAny, TaskRefAny } from "@relkit/contracts/jobs";
import type { JobDescriptorAny } from "./job.types.js";

/** How a task selected its job binding. */
export type BindingSource = "explicit" | "default" | "implicit";

/** Inputs for resolving one task to its executable job. */
export interface ResolveBindingOptions {
  readonly task: TaskRefAny;
  readonly jobs?: readonly JobDescriptorAny[];
  readonly selector?: JobDescriptorAny | JobRefAny;
  readonly implicitName?: string;
  readonly profiles?: readonly string[] | Readonly<Record<string, unknown>>;
  readonly defaultProfile?: string;
}

/** Canonical task-to-job selection returned by the binding resolver. */
export interface ResolvedTaskBinding {
  readonly taskId: string;
  readonly taskVersion?: string;
  readonly jobId: string;
  readonly name: string;
  readonly service?: string;
  readonly profile: string;
  readonly source: BindingSource;
  readonly implicit: boolean;
  readonly default: boolean;
  readonly private: boolean;
  readonly job?: JobDescriptorAny;
}

/** Machine-readable reason for a binding resolution failure. */
export type JobBindingErrorCode =
  | "MISSING_IMPLICIT_NAME"
  | "INVALID_IMPLICIT_NAME"
  | "TASK_SELECTOR_MISMATCH"
  | "UNKNOWN_JOB_SELECTOR"
  | "AMBIGUOUS_JOB"
  | "DUPLICATE_JOB_ID"
  | "MULTIPLE_DEFAULT_JOBS"
  | "MISSING_JOB_PROFILE"
  | "AMBIGUOUS_JOB_PROFILE"
  | "UNKNOWN_JOB_PROFILE";

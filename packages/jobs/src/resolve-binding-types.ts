import type { JobRefAny, TaskRefAny } from "@relkit/contracts/jobs";
import type { JobDescriptorAny } from "./job-types.js";

export type BindingSource = "explicit" | "default" | "implicit";

export interface ResolveBindingOptions {
  readonly task: TaskRefAny;
  readonly jobs?: readonly JobDescriptorAny[];
  readonly selector?: JobDescriptorAny | JobRefAny;
  readonly implicitName?: string;
  readonly profiles?: readonly string[] | Readonly<Record<string, unknown>>;
  readonly defaultProfile?: string;
}

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

export class JobBindingResolutionError extends TypeError {
  readonly code: JobBindingErrorCode;

  constructor(code: JobBindingErrorCode, message: string) {
    super(message);
    this.name = "JobBindingResolutionError";
    this.code = code;
  }
}

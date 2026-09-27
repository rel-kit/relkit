import type { JobBindingErrorCode } from "./resolve-binding.types.js";

/** A deterministic task-to-job binding resolution failure.
 * @example new JobBindingResolutionError("UNKNOWN_JOB_SELECTOR", "Unknown job");
 */
export class JobBindingResolutionError extends TypeError {
  readonly code: JobBindingErrorCode;

  /** Constructs a binding error with a stable machine-readable code.
   * @param code - Resolution failure code.
   * @param message - Human-readable explanation.
   * @example new JobBindingResolutionError("UNKNOWN_JOB_SELECTOR", "Unknown job");
   */
  constructor(code: JobBindingErrorCode, message: string) {
    super(message);
    this.name = "JobBindingResolutionError";
    this.code = code;
  }
}

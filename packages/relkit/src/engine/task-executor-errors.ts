/** Compatibility failure for an invalid native task execution envelope. */
export class TaskExecutionError extends Error {
  readonly code = "RELKIT_TASK_EXECUTION_INVALID" as const;

  /** Retain the stable public diagnostic fields for this compatibility error.
   * @param message - Safe compatibility diagnostic.
   * @returns undefined
   */
  constructor(message: string) {
    super(message);
    this.name = "TaskExecutionError";
  }
}

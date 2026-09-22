export class TaskExecutionError extends Error {
  readonly code = "RELKIT_TASK_EXECUTION_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "TaskExecutionError";
  }
}

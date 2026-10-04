export type {
  JobWatchOptions,
  JobWatchState,
  JobWatchFrame,
  JobWatchListener,
  JobWatchController,
} from "./watch.types.js";

export class JobWatchDisposedError extends Error {
  readonly code = "RELKIT_JOB_WATCH_DISPOSED" as const;

  /**
   * Creates JobWatchDisposedError with its existing public state and failure contract.
   * @returns The owner or public error instance.
   */
  constructor() {
    super("The job watch has been permanently disposed.");
    this.name = "JobWatchDisposedError";
  }
}

export class JobWatchAbortedError extends Error {
  readonly code = "RELKIT_JOB_WATCH_ABORTED" as const;

  /**
   * Creates JobWatchAbortedError with its existing public state and failure contract.
   * @returns The owner or public error instance.
   */
  constructor() {
    super("The job watch connection was interrupted before setup completed.");
    this.name = "JobWatchAbortedError";
  }
}

export class JobWatchUnavailableError extends Error {
  readonly code = "RELKIT_JOB_WATCH_UNAVAILABLE" as const;

  /**
   * Creates JobWatchUnavailableError with its existing public state and failure contract.
   * @returns The owner or public error instance.
   */
  constructor() {
    super("A usable run identity is required before observing a job.");
    this.name = "JobWatchUnavailableError";
  }
}

export class JobWatchReadTimeoutError extends Error {
  readonly code = "RELKIT_JOB_WATCH_READ_TIMEOUT" as const;

  /**
   * Creates JobWatchReadTimeoutError with its existing public state and failure contract.
   * @returns The owner or public error instance.
   */
  constructor() {
    super("The job watch read exceeded its bounded timeout.");
    this.name = "JobWatchReadTimeoutError";
  }
}

/**
 * Recognizes only the existing terminal run statuses.
 * @param run - Authoritative run payload.
 * @returns Whether the run has a supported terminal status.
 */
export function isTerminalRun(run: unknown): boolean {
  if (run === null || typeof run !== "object") return false;
  const status = (run as { readonly status?: unknown }).status;
  return (
    status === "completed" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "timed-out"
  );
}

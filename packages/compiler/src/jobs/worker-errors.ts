import { Schema } from "effect";

/** Immutable worker or historical routing conflict, compatible with the original Error API. */
export class JobWorkerConflictError extends Schema.TaggedError<JobWorkerConflictError>()(
  "JobWorkerConflictError",
  { path: Schema.String },
) {
  readonly code = "RELKIT_JOB_WORKER_IMMUTABLE_CONFLICT" as const;

  /**
   * Constructs a conflict at an immutable artifact path.
   * @param path - Full path of the conflicting worker or routing manifest.
   * @returns A tagged Error carrying the original code, name, path, and message.
   */
  constructor(path: string) {
    super({ path });
    this.name = "JobWorkerConflictError";
  }

  /**
   * Original diagnostic text used by synchronous and Promise callers.
   * @returns The conflict description including its immutable artifact path.
   */
  override get message(): string {
    return `Immutable job worker entry already exists with different content: ${this.path}`;
  }
}

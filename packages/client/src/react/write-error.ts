export class RelkitWriteError extends Error {
  /** `WRITE_NOT_SENT` when the request never left, `WRITE_OUTCOME_UNKNOWN` otherwise. */
  readonly code: "WRITE_NOT_SENT" | "WRITE_OUTCOME_UNKNOWN";
  readonly status = 0;
  readonly data = undefined;
  readonly defined = false as const;

  /**
   * Creates RelkitWriteError with its existing public state and failure contract.
   * @param outcome - Authoritative terminal outcome.
   * @param message - Existing public error message.
   * @returns The owner or public error instance.
   */
  constructor(
    readonly outcome: "not-sent" | "unknown",
    message: string,
  ) {
    super(message);
    this.name = "RelkitWriteError";
    this.code = outcome === "not-sent" ? "WRITE_NOT_SENT" : "WRITE_OUTCOME_UNKNOWN";
  }
}

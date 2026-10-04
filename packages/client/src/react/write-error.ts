export class RelkitWriteError extends Error {
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
  }
}

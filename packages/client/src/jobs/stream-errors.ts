export class JobStreamOverflowError extends Error {
  readonly code = "RELKIT_JOB_STREAM_OVERFLOW" as const;

  /**
   * Creates JobStreamOverflowError with its existing public state and failure contract.
   * @param limit - Existing bound that was exceeded.
   * @returns The owner or public error instance.
   */
  constructor(readonly limit: "frames" | "bytes" | "item-bytes") {
    super(`The named job stream exceeded its ${limit} bound.`);
    this.name = "JobStreamOverflowError";
  }
}

export class JobStreamGapError extends Error {
  readonly code = "RELKIT_JOB_STREAM_GAP" as const;

  /**
   * Creates JobStreamGapError with its existing public state and failure contract.
   * @param expected - Expected content sequence.
   * @param received - Observed content sequence.
   * @returns The owner or public error instance.
   */
  constructor(
    readonly expected: number,
    readonly received: number,
  ) {
    super(`The named job stream skipped content sequence ${expected} before ${received}.`);
    this.name = "JobStreamGapError";
  }
}

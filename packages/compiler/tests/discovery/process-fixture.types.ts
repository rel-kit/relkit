/** Control flags for the isolated in-memory process fixture. */
export interface ProcessFixtureOptions {
  readonly completeOnEnd?: boolean;

  /**
   * Controls the result of a fixture input write.
   * @returns The accepted byte count or a pending/rejected Promise selected by the test.
   */
  readonly write?: () => number | Promise<number>;
  readonly outputError?: Error;
  readonly pendingOutput?: boolean;
  readonly afterExitError?: Error;
}

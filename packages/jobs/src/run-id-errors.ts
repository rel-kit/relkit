/** Compatibility error for an invalid, unauthenticated, or unroutable locator.
 * @example throw new RunLocatorError();
 */
export class RunLocatorError extends TypeError {
  readonly code = "RELKIT_JOB_LOCATOR_INVALID" as const;

  /** Constructs the stable public locator error.
   * @example new RunLocatorError();
   */
  constructor() {
    super("Run locator is invalid or no longer routable");
    this.name = "RunLocatorError";
  }
}

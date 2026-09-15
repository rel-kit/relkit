export class RunLocatorError extends TypeError {
  readonly code = "RELKIT_JOB_LOCATOR_INVALID" as const;

  constructor() {
    super("Run locator is invalid or no longer routable");
    this.name = "RunLocatorError";
  }
}

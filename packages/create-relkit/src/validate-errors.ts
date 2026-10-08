/** Stable public creation-validation constructor, independent of native I/O adapters. */
export class CreateValidationError extends Error {
  /**
   * Constructs the unchanged creation validation rejection.
   * @param code - Existing public validation code.
   * @param message - User-facing validation explanation.
   * @returns The original public constructor identity.
   */
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CreateValidationError";
  }
}

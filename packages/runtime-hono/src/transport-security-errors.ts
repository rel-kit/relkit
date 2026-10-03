/** Public origin or CSRF denial retained across transport adapters. */
export class TransportSecurityError extends Error {
  /** Create a safe transport-policy failure.
   * @param code - Origin or CSRF failure classification.
   * @param message - Public diagnostic describing the rejected policy.
   */
  constructor(
    readonly code: "ORIGIN_DENIED" | "CSRF_DENIED",
    message: string,
  ) {
    super(message);
    this.name = "TransportSecurityError";
  }
}

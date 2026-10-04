/** Public generation ownership error with its established machine-readable code. */
export class SupervisorDrainError extends Error {
  readonly code: "RELKIT_DRAIN_STATE_INVALID" | "RELKIT_DRAIN_TOKEN_MISMATCH";
  /** @param code - Existing ownership failure code. @param message - Compatibility diagnostic. */
  constructor(code: SupervisorDrainError["code"], message: string) {
    super(message);
    this.name = "SupervisorDrainError";
    this.code = code;
  }
}

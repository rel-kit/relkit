/** Existing public doctor exception, retained at the Promise boundary. */
export class DoctorCommandError extends Error {
  readonly code: string;

  /**
   * Constructs the unchanged command failure.
   * @param code - Existing public failure code.
   * @param message - Public diagnostic text.
   */
  constructor(code: string, message: string) {
    super(message);
    this.name = "DoctorCommandError";
    this.code = code;
  }
}

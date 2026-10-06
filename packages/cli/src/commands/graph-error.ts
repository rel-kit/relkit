/** Existing graph command exception, preserved at Promise and reporter boundaries. */
export class GraphCommandError extends Error {
  readonly code: string;
  /**
   * Constructs the public failure without changing its code or message.
   * @param code - Established graph diagnostic code.
   * @param message - Existing human-readable failure text.
   */
  constructor(code: string, message: string) {
    super(message);
    this.name = "GraphCommandError";
    this.code = code;
  }
}

/** Internal marker for an expected synchronous input failure.
 * It remains a TypeError for existing compatibility callers.
 * @example throw new FunctionInputError("Invalid function input");
 */
export class FunctionInputError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "TypeError";
  }
}

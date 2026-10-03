/** Choose the smallest configured positive concurrency limit.
 * @returns The smallest configured limit, or undefined when every limit is absent.
 * @param functionLimit - Optional maximum active executions for the target function.
 * @param triggerLimit - Optional capacity limit for this trigger.
 */
export function effectiveConcurrencyLimit(
  functionLimit: number | undefined,
  triggerLimit: number | undefined,
): number | undefined {
  validateLimit(functionLimit, "functionLimit");
  validateLimit(triggerLimit, "triggerLimit");
  if (functionLimit === undefined) return triggerLimit;
  if (triggerLimit === undefined) return functionLimit;
  return Math.min(functionLimit, triggerLimit);
}

/** Reject non-integer, non-positive or non-finite concurrency limits.
 * @returns Nothing; invalid configured limits throw RangeError.
 * @param value - Native value being validated or projected.
 * @param name - Declared operation, dependency or field name.
 */
export function validateLimit(value: number | undefined, name: string): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) {
    throw new RangeError(`${name} must be a positive integer`);
  }
}

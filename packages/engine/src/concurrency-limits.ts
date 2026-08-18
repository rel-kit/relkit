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

export function validateLimit(value: number | undefined, name: string): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) {
    throw new RangeError(`${name} must be a positive integer`);
  }
}

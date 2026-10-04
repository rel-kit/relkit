/**
 * Enumerates only the existing nested public recovery envelopes.
 * @param value - Original input or payload; its identity is retained where required.
 * @returns The existing public recovery envelopes in lookup order.
 */
export function candidates(value: unknown): readonly unknown[] {
  if (!isRecord(value)) return [value];
  return [value, value.data, value.cause, isRecord(value.cause) ? value.cause.data : undefined];
}

/**
 * Checks whether the existing property-access boundary accepts a supplied value.
 * @param value - Original input or payload; its identity is retained where required.
 * @returns Whether property access is valid for this boundary.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

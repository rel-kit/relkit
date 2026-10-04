/**
 * Constructs a manager-local sharing key without losing parameter distinctions.
 * @param channel - Declared channel name.
 * @param params - JSON-compatible channel parameters.
 * @returns An ordered representation, with the manager supplying identity isolation.
 */
export function realtimeSubscriptionKey(channel: string, params: unknown): string {
  return JSON.stringify([channel, canonical(params)]);
}

/**
 * Orders object keys while retaining array order and primitives.
 * @param value - Channel sharing key component.
 * @returns Its stable structural representation.
 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]),
  );
}

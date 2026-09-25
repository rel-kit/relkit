import type { ProviderAdapter } from "./protocol.types.js";
import { ProviderInputError } from "./provider-compat-errors.js";
/** Check that a source contains a current adapter descriptor.
 * @param value - Source candidate.
 * @returns Nothing when valid.
 * @throws TypeError for nested wrappers or unsupported protocol versions.
 * @example assertAdapter(adapter);
 */
export function assertAdapter(value: unknown): asserts value is ProviderAdapter {
  if (isRecord(value) && value.kind === "provider-adapter" && value.protocolVersion !== 1)
    throw new ProviderInputError(
      `Provider protocol version ${String(value.protocolVersion)} is unsupported; rewrite the app with current integration constructors.`,
    );
  if (!isAdapter(value)) throw new ProviderInputError("Provider source wrappers cannot be nested");
}
/** Check whether a direct adapter has all required authored values.
 * @param adapter - Adapter to inspect.
 * @returns Nothing when all required fields are present.
 * @throws TypeError listing absent required fields.
 * @example assertConnected(adapter);
 */
export function assertConnected(adapter: ProviderAdapter): void {
  const missing = Object.entries(adapter.connectionContract.fields)
    .filter(
      ([name, field]) =>
        field.required &&
        !Object.prototype.hasOwnProperty.call(adapter.connection, name) &&
        !Object.prototype.hasOwnProperty.call(field, "default"),
    )
    .map(([name]) => name);
  if (missing.length > 0)
    throw new ProviderInputError(
      `${label(adapter)} is missing connection fields: ${missing.join(", ")}`,
    );
}
/** Test whether an adapter has all required authored values.
 * @param adapter - Adapter to inspect.
 * @returns True if all required values are available.
 * @example isConfigured(adapter);
 */
export function isConfigured(adapter: ProviderAdapter): boolean {
  try {
    assertConnected(adapter);
    return true;
  } catch (cause) {
    if (cause instanceof ProviderInputError) return false;
    throw cause;
  }
}
/** Test a descriptor's protocol marker.
 * @param value - Candidate descriptor.
 * @returns True for a current provider adapter.
 * @example isAdapter(adapter);
 */
export function isAdapter(value: unknown): value is ProviderAdapter {
  return isRecord(value) && value.kind === "provider-adapter" && value.protocolVersion === 1;
}
/** Format the stable capability and adapter label for errors.
 * @param adapter - Adapter to label.
 * @returns The capability and adapter IDs.
 * @example label(adapter);
 */
export function label(adapter: ProviderAdapter): string {
  return `${adapter.capability.id}.${adapter.adapterId}`;
}
/** Test whether a value is a non-array record.
 * @param value - Candidate value.
 * @returns True for a record object.
 * @example isRecord({ kind: "provider-adapter" });
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

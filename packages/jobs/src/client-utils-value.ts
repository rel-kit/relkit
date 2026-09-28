import { validate, type StandardSchemaV1 } from "@relkit/schema";
import type { JobEnqueueResult } from "@relkit/functions";
import { JobInputValidationError, JobProfileError, JobProviderError } from "./client-errors.js";
import type { JobClientOptions, JobProvider, JobProviderResult } from "./client.types.js";
/** Resolves an enqueue provider from a named profile or explicit resolver.
 * @param source - Provider or profile map.
 * @param profile - Requested profile.
 * @param resolveProfile - Optional custom resolver.
 * @returns A provider implementing enqueue.
 * @throws JobProfileError or JobProviderError when unavailable.
 * @example resolveProviderValue(providers, "primary", undefined);
 */
export function resolveProviderValue(
  source: unknown,
  profile: string,
  resolveProfile: ((profile: string) => unknown) | undefined,
): JobProvider {
  const selected = resolveProfile?.(profile) ?? profileValue(source, profile);
  if (isProvider(selected)) return selected;
  if (selected === undefined) throw new JobProfileError(profile);
  throw new JobProviderError();
}
function profileValue(source: unknown, profile: string): unknown {
  if (isProvider(source)) return source;
  const value = isRecord(source) && source.capability === "jobs" ? source.value : source;
  if (isProvider(value)) return value;
  return isRecord(value) ? value[profile] : undefined;
}
/** Validates authored client input before enqueueing.
 * @param schema - Optional Standard Schema input validator.
 * @param input - Caller input.
 * @returns Validated input, or the original input without a schema.
 * @throws JobInputValidationError for schema issues.
 * @example await parseInputValue(schema, { id: "one" });
 */
export async function parseInputValue(
  schema: StandardSchemaV1 | undefined,
  input: unknown,
): Promise<unknown> {
  if (schema === undefined) return input;
  const result = await validate(schema, input as never);
  if (result.issues !== undefined) throw new JobInputValidationError(result.issues);
  return result.value;
}
/** Normalizes a provider acceptance into the public enqueue receipt.
 * @param value - Optional provider result.
 * @param profile - Selected provider profile.
 * @param correlationId - Optional caller correlation.
 * @returns A frozen accepted receipt with an instance ID.
 * @example normalizeResultValue(result, "primary", "request-1");
 */
export function normalizeResultValue(
  value: JobProviderResult | undefined,
  profile: string,
  correlationId: string | undefined,
): JobEnqueueResult {
  const metadata: Record<string, any> =
    isRecord(value) && value.accepted === true && typeof value.instanceId === "string" ? value : {};
  return Object.freeze({
    ...metadata,
    instanceId:
      typeof metadata.instanceId === "string" ? metadata.instanceId : `job-${crypto.randomUUID()}`,
    accepted: true as const,
    status: "accepted" as const,
    profile,
    ...(correlationId === undefined ? {} : { correlationId }),
  });
}
/** Calls an optional observer without letting hook errors change acceptance.
 * @param hook - Optional observer callback.
 * @param value - Frozen value delivered to the callback.
 * @param enabled - Whether to notify.
 * @returns Nothing; callback failures are contained.
 * @example notifyValue(onAccepted, receipt);
 */
export function notifyValue<T>(
  hook: ((value: T) => void) | undefined,
  value: T,
  enabled = true,
): void {
  if (!enabled) return;
  try {
    hook?.(Object.freeze(value));
  } catch {
    // Hook failures cannot change job acceptance or provider execution.
  }
}
/** Resolves a literal or lazy client correlation identifier.
 * @param value - Literal identifier or provider callback.
 * @returns The resolved identifier when present.
 * @example resolveCorrelationValue(() => "request-1");
 */
export function resolveCorrelationValue(
  value: JobClientOptions["correlationId"],
): string | undefined {
  return typeof value === "function" ? value() : value;
}
/** Validates the client enqueue options shape and correlation identifier.
 * @param value - Untrusted caller options.
 * @returns Nothing when the options are valid.
 * @throws TypeError for missing object shape or invalid correlation text.
 * @example assertOptionsValue({ correlationId: "request-1" });
 */
export function assertOptionsValue(
  value: unknown,
): asserts value is { readonly correlationId?: string } {
  if (!isRecord(value)) throw new TypeError("Job enqueue options must be an object");
  assertOptionalTextValue(value.correlationId, "correlationId");
}
/** Requires a present optional text field to be nonempty.
 * @param value - Candidate text.
 * @param name - Field name for the error.
 * @returns Nothing when absent or valid.
 * @throws TypeError for nontext or blank text.
 * @example assertOptionalTextValue("request-1", "correlationId");
 */
export function assertOptionalTextValue(value: unknown, name: string): void {
  if (value !== undefined && (typeof value !== "string" || value.trim() === ""))
    throw new TypeError(`Job ${name} must be non-empty text`);
}
function isProvider(value: unknown): value is JobProvider {
  return isRecord(value) && typeof value.enqueue === "function";
}
function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

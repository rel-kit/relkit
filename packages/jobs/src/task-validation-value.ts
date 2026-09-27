import { normalizeId } from "@relkit/contracts";
import { getJsonSchema, isSchemaTransformed, type StandardSchemaV1 } from "@relkit/schema";
import { durationToMillis, type DurationInput } from "./duration.js";
import { assertCanonicalProjection } from "./canonical-support.js";
import type { NormalizedTaskRetryPolicy, TaskStreamSchemas } from "./task-types.js";
/** Requires the Standard Schema v1 validator shape.
 * @param value - Candidate schema.
 * @param name - Field label for diagnostics.
 * @returns Nothing for a compatible validator.
 * @throws TypeError for missing or malformed Standard Schema fields.
 * @example assertSchema(schema, "Task input");
 */
export function assertSchema(value: unknown, name: string): asserts value is StandardSchemaV1 {
  if (
    !isRecord(value) ||
    !isRecord(value["~standard"]) ||
    value["~standard"].version !== 1 ||
    typeof value["~standard"].validate !== "function"
  ) {
    throw new TypeError(`${name} must be a Standard Schema v1 validator`);
  }
}
/** Normalizes the task version to a stable identifier.
 * @param value - Authored version.
 * @returns Normalized version text.
 * @throws TypeError for invalid identifiers.
 * @example normalizeVersion("v1");
 */
export function normalizeVersion(value: unknown): string {
  return normalizeId(value);
}
/** Requires transformed input to provide a canonical identity validator.
 * @param input - Authored task input schema.
 * @param inputWire - Optional canonical wire schema.
 * @returns Nothing when canonical input can be validated faithfully.
 * @throws TypeError for unsupported transformations.
 * @example assertInputWireSupport(inputSchema, inputWireSchema);
 */
export function assertInputWireSupport(input: StandardSchemaV1, inputWire: unknown): void {
  if (inputWire !== undefined) {
    assertSchema(inputWire, "Task inputWire");
    assertCanonicalSchemaSupport(inputWire, "Task inputWire", true);
    return;
  }
  const inputProjection = getJsonSchema(input, { direction: "input" });
  const outputProjection = getJsonSchema(input, { direction: "output" });
  if (isSchemaTransformed(input) || (inputProjection.ok && !outputProjection.ok)) {
    throw new TypeError("Transformed task inputs require an identity-preserving inputWire schema");
  }
  if (outputProjection.ok) assertCanonicalProjection(outputProjection.schema, "Task input", true);
}
/** Checks a schema's faithful canonical output projection.
 * @param schema - Schema to project.
 * @param name - Field label for diagnostics.
 * @param allowVoid - Whether undefined output is allowed.
 * @returns Nothing for a supported canonical schema.
 * @throws TypeError for transforms or missing projections.
 * @example assertCanonicalSchemaSupport(outputSchema, "Task output");
 */
export function assertCanonicalSchemaSupport(
  schema: StandardSchemaV1,
  name: string,
  allowVoid = false,
): void {
  if (isSchemaTransformed(schema)) {
    throw new TypeError(`${name} must validate canonical values without a transformation`);
  }
  const projection = getJsonSchema(schema, { direction: "output" });
  if (!projection.ok) throw new TypeError(`${name} has no faithful canonical validator`);
  assertCanonicalProjection(projection.schema, name, allowVoid);
}
/** Checks every stream item schema for canonical output support.
 * @param streams - Named stream item schemas.
 * @returns Nothing when each stream can be stored canonically.
 * @throws TypeError for unsupported stream item schemas.
 * @example assertCanonicalStreamSupport({ events: eventSchema });
 */
export function assertCanonicalStreamSupport(streams: TaskStreamSchemas | undefined): void {
  for (const [name, schema] of Object.entries(streams ?? {})) {
    assertCanonicalSchemaSupport(schema, `Task stream "${name}"`);
  }
}
/** Applies safe retry defaults and validates delay, factor, and jitter.
 * @param value - Authored task retry policy.
 * @returns Frozen normalized retry policy.
 * @throws TypeError for invalid attempts or delay relationships.
 * @example normalizeRetry({ maxAttempts: 5 });
 */
export function normalizeRetry(value: unknown): NormalizedTaskRetryPolicy {
  const input = value === undefined ? {} : value;
  if (!isRecord(input)) throw new TypeError("Task retry policy must be an object");
  const maxAttemptsValue = input.maxAttempts;
  const maxAttempts = maxAttemptsValue === undefined ? 3 : maxAttemptsValue;
  if (typeof maxAttempts !== "number" || !Number.isSafeInteger(maxAttempts) || maxAttempts < 1) {
    throw new TypeError("retry.maxAttempts must be a positive integer");
  }
  const initialDelay = duration(input.initialDelay ?? "1 second", "retry.initialDelay");
  const maxDelay = duration(input.maxDelay ?? "30 seconds", "retry.maxDelay");
  if (durationToMillis(initialDelay) > durationToMillis(maxDelay)) {
    throw new TypeError("retry.initialDelay must be at most retry.maxDelay");
  }
  const factor = input.factor ?? 2;
  if (typeof factor !== "number" || !Number.isFinite(factor) || factor < 1) {
    throw new TypeError("retry.factor must be a finite number at least 1");
  }
  const jitter = input.jitter ?? "none";
  if (jitter !== "none" && jitter !== "full") {
    throw new TypeError('retry.jitter must be "none" or "full"');
  }
  return Object.freeze({ maxAttempts, initialDelay, maxDelay, factor, jitter });
}
/** Validates readable duration text and optional positivity.
 * @param value - Authored duration.
 * @param name - Field label for diagnostics.
 * @param positive - Whether zero is forbidden.
 * @returns Validated duration text.
 * @throws TypeError for unreadable or nonpositive durations.
 * @example duration("1 second", "timeout", true);
 */
export function duration(value: unknown, name: string, positive = false): DurationInput {
  if (typeof value !== "string") throw new TypeError(`${name} must be a readable duration`);
  const milliseconds = durationToMillis(value as DurationInput);
  if (positive && milliseconds < 1) throw new TypeError(`${name} must be positive`);
  return value as DurationInput;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

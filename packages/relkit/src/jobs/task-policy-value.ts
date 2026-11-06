import { durationToMillis } from "./duration.js";
import type { NormalizedTaskRetryPolicy } from "./task-types.js";
/** Maximum canonical task input bytes.
 * @example TASK_INPUT_MAX_BYTES === 1_048_576;
 */
export const TASK_INPUT_MAX_BYTES = 1_048_576;
/** Maximum canonical task output bytes.
 * @example TASK_OUTPUT_MAX_BYTES === 1_048_576;
 */
export const TASK_OUTPUT_MAX_BYTES = 1_048_576;
/** Maximum progress or stream item bytes.
 * @example TASK_ITEM_MAX_BYTES === 65_536;
 */
export const TASK_ITEM_MAX_BYTES = 64 * 1024;
/** Maximum identifier and scalar key bytes.
 * @example TASK_KEY_MAX_BYTES === 256;
 */
export const TASK_KEY_MAX_BYTES = 256;
/** Maximum bounded reason text bytes.
 * @example TASK_REASON_MAX_BYTES === 1_024;
 */
export const TASK_REASON_MAX_BYTES = 1_024;
/** Maximum count of unique task tags.
 * @example TASK_MAX_TAGS === 20;
 */
export const TASK_MAX_TAGS = 20;
const MEMORY_PATTERN = /^(\d+)(?:\.(\d+))? (MiB|GiB)$/u;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const MEMORY_UNITS = { MiB: 1_048_576n, GiB: 1_073_741_824n } as const;
/** Counts UTF-8 bytes rather than JavaScript code units.
 * @param value - Text to measure.
 * @returns Encoded byte count.
 * @example utf8Bytes("é");
 */
export function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
/** Requires a nonempty UTF-8 string within a configured byte limit.
 * @param value - Candidate text.
 * @param name - Field label for diagnostics.
 * @param maxBytes - Maximum encoded bytes.
 * @returns Nothing for valid text.
 * @throws TypeError for empty, nontext, or oversized values.
 * @example assertBoundedString("order-1", "orderId");
 */
export function assertBoundedString(
  value: unknown,
  name: string,
  maxBytes = TASK_KEY_MAX_BYTES,
): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || utf8Bytes(value) > maxBytes) {
    throw new TypeError(`${name} must be a non-empty string of at most ${maxBytes} UTF-8 bytes`);
  }
}
/** Requires one top-level canonical field name rather than a path.
 * @param value - Candidate field name.
 * @param name - Label for diagnostics.
 * @returns Nothing for a bounded field name.
 * @throws TypeError for invalid paths or expressions.
 * @example assertFieldName("tenantId");
 */
export function assertFieldName(value: unknown, name = "field name"): asserts value is string {
  assertBoundedString(value, name);
  if (/[.\[\](){}$\s]/u.test(value)) {
    throw new TypeError(`${name} must identify one top-level field, not a path or expression`);
  }
}
/** Parses exact decimal MiB or GiB memory into safe integer bytes.
 * @param value - Authored memory amount.
 * @returns Exact byte count.
 * @throws TypeError for fractional bytes or unsafe ranges.
 * @example memoryBytes("1.5 GiB");
 */
export function memoryBytes(value: string): number {
  const match = MEMORY_PATTERN.exec(value);
  if (!match || value.length > 128)
    throw new TypeError("Memory must be a decimal MiB or GiB value");
  const whole = match[1];
  const fraction = match[2] ?? "";
  const unit = match[3] as keyof typeof MEMORY_UNITS;
  const scale = 10n ** BigInt(fraction.length);
  const amount = BigInt(whole!) * scale + BigInt(fraction || "0");
  const bytesNumerator = amount * MEMORY_UNITS[unit];
  if (bytesNumerator % scale !== 0n)
    throw new TypeError("Memory must resolve to an exact byte count");
  const bytes = bytesNumerator / scale;
  if (bytes < 1n || bytes > MAX_SAFE) throw new TypeError("Memory is outside the safe byte range");
  return Number(bytes);
}
/** Computes bounded task retry delay with optional jitter and retry-after floor.
 * @param policy - Normalized retry policy.
 * @param attempt - Positive retry attempt number.
 * @param retryAfterMillis - Native minimum delay.
 * @param random - Injectable jitter sample.
 * @returns Delay in milliseconds.
 * @throws TypeError for invalid attempt or jitter.
 * @example retryDelayMillis(policy, 2, 0, () => 0.5);
 */
export function retryDelayMillis(
  policy: NormalizedTaskRetryPolicy,
  attempt: number,
  retryAfterMillis = 0,
  random = Math.random,
): number {
  if (!Number.isSafeInteger(attempt) || attempt < 1)
    throw new TypeError("attempt must be positive");
  if (!Number.isSafeInteger(retryAfterMillis) || retryAfterMillis < 0) {
    throw new TypeError("retry-after must be a non-negative safe integer");
  }
  const initial = durationToMillis(policy.initialDelay);
  const maximum = durationToMillis(policy.maxDelay);
  let cap = initial;
  for (let index = 1; index < attempt && cap < maximum; index += 1) {
    cap =
      cap > maximum / policy.factor ? maximum : Math.min(maximum, Math.floor(cap * policy.factor));
  }
  if (policy.jitter === "none") return Math.max(cap, retryAfterMillis);
  const sample = random();
  if (!Number.isFinite(sample)) throw new TypeError("jitter sample must be finite");
  const delay = Math.min(cap, Math.max(0, Math.floor(sample * (cap + 1))));
  return Math.max(delay, retryAfterMillis);
}
export {
  copyTaskTags,
  copyResources,
  copyConcurrency,
  assertCanonicalScalarKey,
  copyLogging,
} from "./task-policy-value-copy.js";

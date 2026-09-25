import { Data, Effect } from "effect";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";
import type { TraceLimits } from "./trace-limits.types.js";

export type { TraceLimits } from "./trace-limits.types.js";

/** Tagged failure for an invalid trace limit.
 * @example Effect.catchTag(traceLimitsEffect({ events: 0 }), "TraceLimitError", () => Effect.void);
 */
export class TraceLimitError extends Data.TaggedError("TraceLimitError")<{
  readonly field: keyof TraceLimits;
  readonly message: string;
}> {}

/** Default bounds for recorded trace data. */
export const DEFAULT_TRACE_LIMITS: TraceLimits = Object.freeze({
  spansPerTrace: 512,
  attributes: 64,
  events: 32,
  links: 64,
  updates: 64,
  attributeBytes: 1024,
  activeSpans: 4096,
  nameBytes: 256,
  keyBytes: 128,
});

/** Resolves limits and reports an invalid field in the Effect error channel.
 * @param options - Overrides for default trace limits.
 * @returns Immutable limits, or `TraceLimitError` for an invalid bound.
 * @example Effect.runSync(traceLimitsEffect({ events: 16 }));
 */
export function traceLimitsEffect(
  options: Partial<TraceLimits> = {},
): Effect.Effect<TraceLimits, TraceLimitError> {
  return observeInvocation(
    "trace.limits",
    Effect.gen(function* () {
      const limits = { ...DEFAULT_TRACE_LIMITS, ...options };
      for (const [key, value] of Object.entries(limits)) {
        if (!Number.isSafeInteger(value) || value < 1)
          return yield* Effect.fail(
            new TraceLimitError({
              field: key as keyof TraceLimits,
              message: `Invalid trace limit: ${key}`,
            }),
          );
      }
      return Object.freeze(limits);
    }),
  );
}

/** Synchronous trace limit compatibility adapter.
 * @param options - Overrides for default trace limits.
 * @returns Immutable resolved trace limits.
 * @throws TypeError when a limit is not a positive safe integer.
 * @example traceLimits({ events: 16 });
 */
export function traceLimits(options: Partial<TraceLimits> = {}): TraceLimits {
  try {
    return runInvocationSync(traceLimitsEffect(options));
  } catch (cause) {
    if (cause instanceof TraceLimitError) throw new TypeError(cause.message);
    throw cause;
  }
}

const encoder = new TextEncoder();

/** Truncates UTF-8 text without splitting a code point.
 * @param value - Text to bound.
 * @param bytes - Maximum encoded bytes.
 * @returns Bounded text; this pure operation has no expected Effect failure.
 * @example Effect.runSync(boundedTraceTextEffect("hello", 4));
 */
export function boundedTraceTextEffect(value: string, bytes: number): Effect.Effect<string> {
  return observeInvocation(
    "trace.bound-text",
    Effect.sync(() => boundText(value, bytes)),
  );
}

/** Synchronous adapter for UTF-8 trace text bounds.
 * @param value - Text to bound.
 * @param bytes - Maximum encoded bytes.
 * @returns Bounded text.
 * @example boundedTraceText("hello", 4);
 */
export function boundedTraceText(value: string, bytes: number): string {
  return runInvocationSync(boundedTraceTextEffect(value, bytes));
}

/** Converts one supported trace attribute to a bounded value.
 * @param value - Candidate attribute.
 * @param bytes - Maximum UTF-8 bytes for string values.
 * @returns A safe scalar or undefined; this pure operation has no expected Effect failure.
 * @example Effect.runSync(safeTraceAttributeEffect("hello", 4));
 */
export function safeTraceAttributeEffect(
  value: unknown,
  bytes: number,
): Effect.Effect<string | number | boolean | undefined> {
  return observeInvocation(
    "trace.safe-attribute",
    Effect.sync(() => {
      if (typeof value === "string") return boundText(value, bytes);
      if (typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)))
        return value;
      return undefined;
    }),
  );
}

/** Synchronous trace attribute compatibility adapter.
 * @param value - Candidate attribute.
 * @param bytes - Maximum UTF-8 bytes for string values.
 * @returns A safe scalar or undefined.
 * @example safeTraceAttribute(Infinity, 32);
 */
export function safeTraceAttribute(
  value: unknown,
  bytes: number,
): string | number | boolean | undefined {
  return runInvocationSync(safeTraceAttributeEffect(value, bytes));
}

/** Checks if a key is reserved for runtime-owned trace identity.
 * @param key - Trace attribute key.
 * @returns Whether the key belongs to the runtime; no expected Effect failure.
 * @example Effect.runSync(isReservedTraceKeyEffect("relkit.invocation.id"));
 */
export function isReservedTraceKeyEffect(key: string): Effect.Effect<boolean> {
  return observeInvocation(
    "trace.reserved-key",
    Effect.sync(() =>
      key.startsWith("relkit.") ||
      /^(?:traceId|spanId|parentSpanId|requestId|originRequestId|invocationId|correlationId)$/.test(
        key,
      ),
    ),
  );
}

/** Synchronous adapter for runtime-owned trace key checks.
 * @param key - Trace attribute key.
 * @returns Whether the key is reserved.
 * @example isReservedTraceKey("traceId");
 */
export function isReservedTraceKey(key: string): boolean {
  return runInvocationSync(isReservedTraceKeyEffect(key));
}

function boundText(value: string, bytes: number): string {
  const encoded = encoder.encode(value);
  if (encoded.length <= bytes) return value;
  let end = bytes;
  while (end > 0 && (encoded[end]! & 0xc0) === 0x80) end--;
  return new TextDecoder().decode(encoded.subarray(0, end));
}

import { Effect } from "effect";
import { isReservedTraceKey } from "./trace-limits.js";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";
import type { TraceAttributes } from "./public-trace-attributes.types.js";

/** Copies own scalar attributes without invoking getters or leaking reserved keys.
 * @param attributes - Candidate trace attributes.
 * @param allowReserved - Whether framework identity keys are allowed.
 * @returns A safe attribute record with no expected failure.
 * @example Effect.runSync(safeTraceAttributesEffect({ ok: true }, false));
 */
export function safeTraceAttributesEffect(
  attributes: TraceAttributes,
  allowReserved: boolean,
): Effect.Effect<TraceAttributes> {
  return observeInvocation("trace.safe-attributes", Effect.sync(() => {
    const safe: Record<string, string | number | boolean> = Object.create(null);
    for (const key of Object.keys(attributes)) {
      const descriptor = Object.getOwnPropertyDescriptor(attributes, key);
      if ((allowReserved || !isReservedTraceKey(key)) && descriptor && "value" in descriptor)
        safe[key] = descriptor.value;
    }
    return safe;
  }));
}

/** Synchronous safe attribute adapter.
 * @param attributes - Candidate trace attributes.
 * @param allowReserved - Whether framework keys are allowed.
 * @returns A safe attribute record.
 * @example safeTraceAttributes({ ok: true }, false);
 */
export function safeTraceAttributes(attributes: TraceAttributes, allowReserved: boolean): TraceAttributes {
  return runInvocationSync(safeTraceAttributesEffect(attributes, allowReserved));
}

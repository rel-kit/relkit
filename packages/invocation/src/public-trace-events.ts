import { Clock, Effect } from "effect";
import { currentExecutionContextEffect } from "./dispatcher-scope.js";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";
import { safeTraceAttributesEffect } from "./public-trace-attributes.js";
import { RelkitSpan } from "./tracing-span.js";
import type { TraceAttributes } from "./public-trace-events.types.js";

/** Emits an event on the current span through Effect.
 * @param name - Event name.
 * @param attributes - Scalar event attributes.
 * @param allowReserved - Whether framework keys are allowed.
 * @returns Void with no expected failure.
 * @example Effect.runSync(traceEventEffect("cache.hit"));
 */
export function traceEventEffect(
  name: string,
  attributes: TraceAttributes = {},
  allowReserved = false,
): Effect.Effect<void> {
  return observeInvocation("trace.event", Effect.gen(function* () {
    const active = (yield* currentExecutionContextEffect())?.span;
    if (!(active instanceof RelkitSpan)) return;
    const safe = yield* safeTraceAttributesEffect(attributes, allowReserved);
    active.event(name, yield* Clock.currentTimeNanos, safe);
  }));
}

/** Synchronous event adapter for public trace facades.
 * @param name - Event name.
 * @param attributes - Scalar event attributes.
 * @param allowReserved - Whether framework keys are allowed.
 * @returns Void.
 * @example traceEvent("cache.hit");
 */
export function traceEvent(name: string, attributes: TraceAttributes = {}, allowReserved = false): void {
  runInvocationSync(traceEventEffect(name, attributes, allowReserved));
}

/** Sets safe attributes on the current span through Effect.
 * @param attributes - Scalar attributes.
 * @param allowReserved - Whether framework keys are allowed.
 * @returns Void with no expected failure.
 * @example Effect.runSync(traceSetAttributesEffect({ cached: true }));
 */
export function traceSetAttributesEffect(
  attributes: TraceAttributes,
  allowReserved = false,
): Effect.Effect<void> {
  return observeInvocation("trace.set-attributes", Effect.gen(function* () {
    const active = (yield* currentExecutionContextEffect())?.span;
    if (!(active instanceof RelkitSpan)) return;
    for (const [key, value] of Object.entries(yield* safeTraceAttributesEffect(attributes, allowReserved)))
      active.attribute(key, value);
  }));
}

/** Synchronous attribute adapter for public trace facades.
 * @param attributes - Scalar attributes.
 * @param allowReserved - Whether framework keys are allowed.
 * @returns Void.
 * @example traceSetAttributes({ cached: true });
 */
export function traceSetAttributes(attributes: TraceAttributes, allowReserved = false): void {
  runInvocationSync(traceSetAttributesEffect(attributes, allowReserved));
}

/** Renames the active framework span through Effect.
 * @param name - Replacement span name.
 * @returns Void with no expected failure.
 * @example Effect.runSync(traceRenameEffect("http.request"));
 */
export function traceRenameEffect(name: string): Effect.Effect<void> {
  return observeInvocation("trace.rename", Effect.flatMap(currentExecutionContextEffect(), (context) =>
    Effect.sync(() => {
      const active = context?.span;
      if (active instanceof RelkitSpan) active.rename(name);
    }),
  ));
}

/** Synchronous span rename adapter.
 * @param name - Replacement name.
 * @returns Void.
 * @example traceRename("http.request");
 */
export function traceRename(name: string): void {
  runInvocationSync(traceRenameEffect(name));
}

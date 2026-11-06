import { Effect } from "effect";
import type { EventClientOptions, EventProvider } from "./client.types.js";
import {
  EventClientValidationError,
  EventProfileError,
  EventProviderError,
} from "./client-errors.js";
import { isRecord } from "./client-record.js";
import { observeEvent, runEventSync } from "./event-observability.js";

/** Resolves a provider for a named profile.
 * @param source - Provider or profile collection.
 * @param profile - Selected profile name.
 * @param resolveProfile - Optional profile resolver.
 * @returns An Effect succeeding with a provider or failing with a tagged profile, provider, or resolver error.
 * @example Effect.runSync(resolveProviderEffect(provider, "default", undefined))
 */
export const resolveProviderEffect = Effect.fn("Events.resolveProvider")(
  (source: unknown, profile: string, resolveProfile: ((profile: string) => unknown) | undefined) =>
    observeEvent(
      "client.resolveProvider",
      Effect.gen(function* () {
        const selected = yield* Effect.try({
          try: () => resolveProfile?.(profile) ?? profileValue(source, profile),
          catch: (cause) =>
            new EventClientValidationError({
              message: cause instanceof Error ? cause.message : "Event profile resolution failed",
              cause,
            }),
        });
        if (isProvider(selected)) return selected;
        if (selected === undefined) return yield* new EventProfileError(profile);
        return yield* new EventProviderError();
      }),
    ),
);

/** Synchronous provider resolution adapter.
 * @param source - Provider or profile collection.
 * @param profile - Selected profile name.
 * @param resolveProfile - Optional profile resolver.
 * @returns The selected provider.
 * @throws EventProfileError, EventProviderError, or a resolver error.
 * @example resolveProvider(provider, "default", undefined)
 */
export function resolveProvider(
  source: unknown,
  profile: string,
  resolveProfile: ((profile: string) => unknown) | undefined,
): EventProvider {
  try {
    return runEventSync(resolveProviderEffect(source, profile, resolveProfile));
  } catch (error) {
    if (error instanceof EventClientValidationError && Object.hasOwn(error, "cause"))
      throw error.cause;
    throw error;
  }
}

/** Invokes an edge hook without allowing telemetry failure to replace publication.
 * @param hook - Optional edge observer.
 * @param value - Frozen event edge.
 * @param enabled - Whether the hook should run.
 * @returns Void.
 * @example notify(onObservedEdge, edge)
 */
export function notify<T>(hook: ((value: T) => void) | undefined, value: T, enabled = true): void {
  runEventSync(notifyEffect(hook, value, enabled));
}

/** Effect implementation of best-effort edge notification.
 * @param hook - Optional edge observer.
 * @param value - Frozen event edge.
 * @param enabled - Whether the hook should run.
 * @returns An Effect succeeding with void; observer defects are ignored.
 * @example Effect.runSync(notifyEffect(onObservedEdge, edge))
 */
export const notifyEffect = Effect.fn("Events.notify")(
  <T>(hook: ((value: T) => void) | undefined, value: T, enabled = true) =>
    observeEvent(
      "client.notify",
      Effect.sync(() => {
        if (!enabled) return;
        try {
          hook?.(Object.freeze(value));
        } catch {
          /* Edge telemetry cannot replace provider work. */
        }
      }),
    ),
);

/** Resolves a fixed or lazy correlation ID.
 * @param value - Fixed ID or callback.
 * @returns The ID, if present.
 * @example resolveValue(() => "correlation-1")
 */
export function resolveValue(value: EventClientOptions["correlationId"]): string | undefined {
  try {
    return runEventSync(resolveValueEffect(value));
  } catch (error) {
    if (error instanceof EventClientValidationError && Object.hasOwn(error, "cause"))
      throw error.cause;
    throw error;
  }
}

/** Effect implementation of lazy correlation ID resolution.
 * @param value - Fixed ID or callback.
 * @returns An Effect succeeding with the ID or failing with a tagged callback error.
 * @example Effect.runSync(resolveValueEffect(() => "correlation-1"))
 */
export const resolveValueEffect = Effect.fn("Events.resolveValue")(
  (value: EventClientOptions["correlationId"]) =>
    observeEvent(
      "client.resolveValue",
      Effect.try({
        try: () => (typeof value === "function" ? value() : value),
        catch: (cause) =>
          new EventClientValidationError({
            message: cause instanceof Error ? cause.message : "Correlation ID resolution failed",
            cause,
          }),
      }),
    ),
);

function profileValue(source: unknown, profile: string): unknown {
  if (isProvider(source)) return source;
  const value = isRecord(source) && source.capability === "events" ? source.value : source;
  if (isProvider(value)) return value;
  return isRecord(value) ? value[profile] : undefined;
}

function isProvider(value: unknown): value is EventProvider {
  return isRecord(value) && typeof value.publish === "function";
}

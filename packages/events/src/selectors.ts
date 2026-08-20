import { deepFreeze } from "@zsys/contracts";
import type { EventName } from "./event-registry.js";
import {
  type AllEventPurpose,
  type AllEventSelector,
  type AnyOfEventSelector,
  type EventSelectorAny,
  type EventSelectorReference,
  type MatchEventSelector,
  type MatchingEventName,
  type SingleEventSelector,
} from "./selector-types.js";

export function single<const Name extends EventName>(name: Name): SingleEventSelector<Name> {
  assertEventName(name);
  return deepFreeze({ kind: "single" as const, event: { eventId: name } });
}

export function anyOf<const Names extends readonly [EventName, ...EventName[]]>(
  ...names: Names
): AnyOfEventSelector<Names> {
  names.forEach(assertEventName);
  if (new Set(names).size !== names.length)
    throw new TypeError("Event selector names must be unique");
  return deepFreeze({
    kind: "anyOf" as const,
    events: names.map((eventId) => ({ eventId })),
  }) as AnyOfEventSelector<Names>;
}

export function match<const Pattern extends string>(
  pattern: Pattern,
): MatchEventSelector<Pattern, MatchingEventName<Pattern>> {
  assertEventPattern(pattern);
  return deepFreeze({ kind: "match" as const, pattern });
}

export function all(options: {
  readonly payload: "unknown";
  readonly purpose?: AllEventPurpose;
}): AllEventSelector {
  if (!isRecord(options) || options.payload !== "unknown")
    throw new TypeError('Raw all-event selectors require payload: "unknown"');
  if (options.purpose !== undefined && !isPurpose(options.purpose))
    throw new TypeError("Raw all-event selector purpose is invalid");
  return deepFreeze({
    kind: "all" as const,
    payload: "unknown" as const,
    ...(options.purpose === undefined ? {} : { purpose: options.purpose }),
  });
}

/**
 * Builds typed selectors for one event, a list, a registry pattern, or every event.
 *
 * @example
 * ```ts
 * import { events } from "@zsys/events"
 *
 * const orderEvents = events.match("orders.*")
 * void orderEvents
 * ```
 * @category Events
 * @since 0.1.0
 */
export const events = Object.freeze({ single, anyOf, match, all });

export function isEventSelector(value: unknown): value is EventSelectorAny {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (value.kind === "single") return isEventSelectorReference(value.event);
  if (value.kind === "anyOf") {
    return (
      Array.isArray(value.events) &&
      value.events.length > 0 &&
      value.events.every(isEventSelectorReference) &&
      new Set(value.events.map((event) => event.eventId)).size === value.events.length
    );
  }
  if (value.kind === "match") return isEventPattern(value.pattern);
  return (
    value.kind === "all" &&
    value.payload === "unknown" &&
    (value.purpose === undefined || isPurpose(value.purpose))
  );
}

export function assertEventSelector(value: unknown): asserts value is EventSelectorAny {
  if (!isEventSelector(value)) throw new TypeError("Invalid event selector");
}

export function copyEventSelector(value: EventSelectorAny): EventSelectorAny {
  assertEventSelector(value);
  if (value.kind === "single") return deepFreeze({ kind: "single", event: { ...value.event } });
  if (value.kind === "anyOf")
    return deepFreeze({ kind: "anyOf", events: value.events.map((event) => ({ ...event })) });
  if (value.kind === "match") return deepFreeze({ kind: "match", pattern: value.pattern });
  return deepFreeze({
    kind: "all",
    payload: "unknown",
    ...(value.purpose === undefined ? {} : { purpose: value.purpose }),
  });
}

export function isEventPattern(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value &&
    value
      .split(".")
      .every((segment) => segment === "*" || segment === "**" || /^[A-Za-z0-9_-]+$/.test(segment))
  );
}

export function assertEventPattern(value: unknown): asserts value is string {
  if (!isEventPattern(value))
    throw new TypeError(
      "Event patterns use non-empty dot segments, * for one segment, or ** for zero or more",
    );
}

function isEventSelectorReference(value: unknown): value is EventSelectorReference {
  return (
    isRecord(value) &&
    Reflect.ownKeys(value).every((key) => key === "eventId" || key === "version") &&
    typeof value.eventId === "string" &&
    value.eventId.trim() !== "" &&
    (value.version === undefined || (Number.isSafeInteger(value.version) && value.version > 0))
  );
}

function assertEventName(value: unknown): asserts value is EventName {
  if (typeof value !== "string" || value.trim() === "")
    throw new TypeError("Event names must be non-empty strings");
}

function isPurpose(value: unknown): value is AllEventPurpose {
  return value === "audit" || value === "telemetry" || value === "development";
}

function isRecord(value: unknown): value is Record<PropertyKey, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

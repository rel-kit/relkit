import { deepFreeze, isStableId } from "@zsys/contracts";
import {
  isEventDescriptor,
  type EventDescriptor,
  type EventDescriptorAny,
  type EventEnvelopeFor,
  type UnknownEventEnvelope,
} from "./define-event.js";

export interface EventSelectorReference<E extends EventDescriptorAny = EventDescriptorAny> {
  readonly eventId: E["id"];
  readonly version: E["version"];
  readonly __event?: E;
}

export interface SingleEventSelector<E extends EventDescriptorAny = EventDescriptorAny> {
  readonly kind: "single";
  readonly event: EventSelectorReference<E>;
  readonly __input?: EventEnvelopeFor<E>;
}

export interface AnyOfEventSelector<
  Events extends readonly EventDescriptorAny[] = readonly EventDescriptorAny[],
> {
  readonly kind: "anyOf";
  readonly events: readonly EventSelectorReference<Events[number]>[];
  readonly __input?: EventEnvelopeFor<Events[number]>;
}

export interface MatchEventSelector<
  Pattern extends string = string,
  Matched extends readonly EventDescriptorAny[] = readonly [],
> {
  readonly kind: "match";
  readonly pattern: Pattern;
  readonly __input?: Matched extends readonly []
    ? UnknownEventEnvelope
    : EventEnvelopeFor<Matched[number]>;
}

export interface AllEventSelector {
  readonly kind: "all";
  readonly payload: "unknown";
  readonly purpose?: AllEventPurpose;
  readonly __input?: UnknownEventEnvelope;
}

export type AllEventPurpose = "audit" | "telemetry" | "development";
export type EventSelector =
  SingleEventSelector | AnyOfEventSelector | MatchEventSelector | AllEventSelector;
export type EventSelectorAny = EventSelector;

export type EventSelectorInput<S extends EventSelectorAny> =
  S extends SingleEventSelector<infer Event>
    ? EventEnvelopeFor<Event>
    : S extends AnyOfEventSelector<infer Events>
      ? EventEnvelopeFor<Events[number]>
      : S extends MatchEventSelector<infer _Pattern, infer Matched>
        ? Matched extends readonly []
          ? UnknownEventEnvelope
          : EventEnvelopeFor<Matched[number]>
        : S extends AllEventSelector
          ? UnknownEventEnvelope
          : UnknownEventEnvelope;

export function single<const Event extends EventDescriptorAny>(
  event: Event,
): SingleEventSelector<Event> {
  assertEvent(event);
  return deepFreeze({
    kind: "single" as const,
    event: eventReference(event),
  }) as SingleEventSelector<Event>;
}

export function anyOf<const Events extends readonly [EventDescriptorAny, ...EventDescriptorAny[]]>(
  ...events: Events
): AnyOfEventSelector<Events> {
  const references = events.map((event) => {
    assertEvent(event);
    return eventReference(event);
  });
  assertUnique(references);
  return deepFreeze({ kind: "anyOf" as const, events: references }) as AnyOfEventSelector<Events>;
}

export function match<const Pattern extends string>(pattern: Pattern): MatchEventSelector<Pattern> {
  assertEventPattern(pattern);
  return deepFreeze({ kind: "match" as const, pattern }) as MatchEventSelector<Pattern>;
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

export const events = Object.freeze({ single, anyOf, match, all });

export function isEventSelector(value: unknown): value is EventSelectorAny {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (value.kind === "single") return isEventSelectorReference(value.event);
  if (value.kind === "anyOf") {
    return (
      Array.isArray(value.events) &&
      value.events.length > 0 &&
      value.events.every(isEventSelectorReference) &&
      new Set(value.events.map((event) => `${event.eventId}@${event.version}`)).size ===
        value.events.length
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
  if (value.kind === "single") {
    return deepFreeze({ kind: "single" as const, event: { ...value.event } });
  }
  if (value.kind === "anyOf") {
    return deepFreeze({
      kind: "anyOf" as const,
      events: value.events.map((event) => ({ ...event })),
    });
  }
  if (value.kind === "match") {
    return deepFreeze({ kind: "match" as const, pattern: value.pattern });
  }
  return deepFreeze({
    kind: "all" as const,
    payload: "unknown" as const,
    ...(value.purpose === undefined ? {} : { purpose: value.purpose }),
  });
}

export function isEventPattern(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) return false;
  return value.split(".").every((segment) => {
    return segment === "*" || segment === "**" || /^[A-Za-z0-9_-]+$/.test(segment);
  });
}

export function assertEventPattern(value: unknown): asserts value is string {
  if (!isEventPattern(value)) {
    throw new TypeError(
      "Event patterns use non-empty dot segments, * for one segment, or ** for zero or more",
    );
  }
}

function eventReference<E extends EventDescriptorAny>(event: E): EventSelectorReference<E> {
  return Object.freeze({ eventId: event.id, version: event.version });
}

function assertEvent(value: unknown): asserts value is EventDescriptorAny {
  if (!isEventDescriptor(value)) throw new TypeError("Event selectors require event descriptors");
}

function assertUnique(eventsToCheck: readonly EventSelectorReference[]): void {
  if (
    new Set(eventsToCheck.map((event) => `${event.eventId}@${event.version}`)).size !==
    eventsToCheck.length
  )
    throw new TypeError("Event selector entries must be unique");
}

function isEventSelectorReference(value: unknown): value is EventSelectorReference {
  if (!isRecord(value)) return false;
  return (
    Reflect.ownKeys(value).every((key) => key === "eventId" || key === "version") &&
    isStableId(value.eventId) &&
    Number.isSafeInteger(value.version) &&
    (value.version as number) > 0
  );
}

function isPurpose(value: unknown): value is AllEventPurpose {
  return value === "audit" || value === "telemetry" || value === "development";
}
function isRecord(value: unknown): value is Record<PropertyKey, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

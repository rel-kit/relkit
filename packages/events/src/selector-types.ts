import type { EventEnvelopeFor, UnknownEventEnvelope } from "./define-event.js";
import type {
  EventDescriptorByName,
  EventName,
  EventPayloadByName,
  EventVersionByName,
} from "./event-registry.js";

export interface EventSelectorReference<Name extends EventName = EventName> {
  readonly eventId: Name;
  readonly version?: EventVersionByName<Name>;
}

export interface SingleEventSelector<Name extends EventName = EventName> {
  readonly kind: "single";
  readonly event: EventSelectorReference<Name>;
  readonly __input?: EventPayloadByName<Name>;
}

export interface AnyOfEventSelector<Names extends readonly EventName[] = readonly EventName[]> {
  readonly kind: "anyOf";
  readonly events: readonly EventSelectorReference<Names[number]>[];
  readonly __input?: EventEnvelopeFor<EventDescriptorByName<Names[number]>>;
}

export interface MatchEventSelector<
  Pattern extends string = string,
  Names extends EventName = MatchingEventName<Pattern>,
> {
  readonly kind: "match";
  readonly pattern: Pattern;
  readonly __input?: [Names] extends [never]
    ? UnknownEventEnvelope
    : EventEnvelopeFor<EventDescriptorByName<Names>>;
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

export type EventSelectorInput<Selector extends EventSelectorAny> =
  Selector extends SingleEventSelector<infer Name>
    ? EventPayloadByName<Name>
    : Selector extends AnyOfEventSelector<infer Names>
      ? EventEnvelopeFor<EventDescriptorByName<Names[number]>>
      : Selector extends MatchEventSelector<string, infer Names>
        ? [Names] extends [never]
          ? UnknownEventEnvelope
          : EventEnvelopeFor<EventDescriptorByName<Names>>
        : UnknownEventEnvelope;

export type MatchingEventName<Pattern extends string> = {
  [Name in EventName]: MatchSegments<Name, Pattern> extends true ? Name : never;
}[EventName];

type MatchSegments<Name extends string, Pattern extends string> = Pattern extends "**"
  ? true
  : Pattern extends `${infer PatternHead}.${infer PatternTail}`
    ? PatternHead extends "**"
      ? MatchSegments<Name, PatternTail> extends true
        ? true
        : Name extends `${string}.${infer NameTail}`
          ? MatchSegments<NameTail, Pattern>
          : false
      : Name extends `${infer NameHead}.${infer NameTail}`
        ? PatternHead extends "*"
          ? MatchSegments<NameTail, PatternTail>
          : NameHead extends PatternHead
            ? MatchSegments<NameTail, PatternTail>
            : false
        : false
    : Pattern extends "*"
      ? Name extends `${string}.${string}`
        ? false
        : true
      : Name extends Pattern
        ? true
        : false;

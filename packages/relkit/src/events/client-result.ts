import { Context, Effect, Layer, Option } from "effect";
import { EventClientValidationError } from "./client-errors.js";
import type {
  EventIdentityService,
  EventOperationContext,
  EventProviderResult,
  EventPublishOptions,
  EventPublishResult,
} from "./client-result.types.js";
import { isRecord } from "./client-record.js";
import { normalizeAttributesEffect } from "./client-validation.js";
import { observeEvent, runEventSync } from "./event-observability.js";

/** Substitutable time and identifier boundary for event envelopes.
 * @example Effect.provide(normalizeResultEffect(reply, payload, {}, context, undefined, "orders.created", 1), EventIdentityLive)
 */
export class EventIdentity extends Context.Service<EventIdentity, EventIdentityService>()(
  "relkit/events/EventIdentity",
) {}

const liveIdentity = EventIdentity.of({
  now: () => new Date(),
  nextId: () => `event-${crypto.randomUUID()}`,
});
/** Default wall clock and random UUID source.
 * @example Effect.provide(normalizeResultEffect(reply, payload, {}, context, undefined, "orders.created", 1), EventIdentityLive)
 */
export const EventIdentityLive = Layer.succeed(EventIdentity, liveIdentity);

/** Builds the accepted event envelope from provider metadata.
 * @param value - Provider acknowledgement.
 * @param payload - Decoded payload.
 * @param options - Validated request options.
 * @param context - Publication context.
 * @param now - Optional clock override.
 * @param eventId - Stable event ID.
 * @param version - Event contract version.
 * @returns An Effect succeeding with the frozen envelope or failing with a tagged validation error.
 * @example Effect.runSync(normalizeResultEffect(reply, input, {}, context, undefined, "orders.created", 1))
 */
export function normalizeResultEffect<Id extends string, Version extends number, Payload>(
  value: EventProviderResult | undefined,
  payload: Payload,
  options: EventPublishOptions,
  context: EventOperationContext,
  now: (() => Date) | undefined,
  eventId: Id,
  version: Version,
): Effect.Effect<EventPublishResult<Id, Version, Payload>, EventClientValidationError> {
  return observeEvent(
    "client.normalizeResult",
    Effect.fn("Events.normalizeResult")(function* () {
      const metadata: Record<string, unknown> =
        isRecord(value) && value.accepted === true ? value : {};
      const configured = yield* Effect.serviceOption(EventIdentity);
      const identity = Option.isSome(configured) ? configured.value : liveIdentity;
      const timestamp = yield* Effect.try({
        try: () => (now?.() ?? identity.now()).toISOString(),
        catch: (cause) =>
          new EventClientValidationError({
            message: cause instanceof Error ? cause.message : "Invalid event timestamp",
            cause,
          }),
      });
      const key = text(metadata.key) ?? options.key;
      const attributes = yield* normalizeAttributesEffect(
        metadata.attributes ?? options.attributes ?? {},
      );
      const instanceId = yield* Effect.try({
        try: () => text(metadata.instanceId) ?? identity.nextId(),
        catch: (cause) =>
          new EventClientValidationError({
            message: cause instanceof Error ? cause.message : "Event identity generation failed",
            cause,
          }),
      });
      return Object.freeze({
        instanceId,
        accepted: true as const,
        eventId,
        version,
        payload,
        occurredAt: text(metadata.occurredAt) ?? timestamp,
        publishedAt: text(metadata.publishedAt) ?? timestamp,
        ...(key === undefined ? {} : { key }),
        ...(context.propagation === undefined ? {} : { propagation: context.propagation }),
        attributes,
      });
    })(),
  );
}

/** Synchronous compatibility adapter for provider result normalization.
 * @param value - Provider acknowledgement.
 * @param payload - Decoded payload.
 * @param options - Validated request options.
 * @param context - Publication context.
 * @param now - Optional clock override.
 * @param eventId - Stable event ID.
 * @param version - Event contract version.
 * @returns The accepted event envelope.
 * @throws TypeError when provider metadata cannot be normalized.
 * @example normalizeResult(reply, input, {}, context, undefined, "orders.created", 1)
 */
export function normalizeResult<Id extends string, Version extends number, Payload>(
  value: EventProviderResult | undefined,
  payload: Payload,
  options: EventPublishOptions,
  context: EventOperationContext,
  now: (() => Date) | undefined,
  eventId: Id,
  version: Version,
): EventPublishResult<Id, Version, Payload> {
  try {
    return runEventSync(
      normalizeResultEffect(value, payload, options, context, now, eventId, version),
    );
  } catch (error) {
    if (error instanceof EventClientValidationError && Object.hasOwn(error, "cause"))
      throw error.cause;
    if (error instanceof EventClientValidationError) throw new TypeError(error.message);
    throw error;
  }
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

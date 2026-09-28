import { isDescriptor, normalizeId } from "@relkit/contracts";
import { createFunctionDescriptor } from "@relkit/functions/internal";
import { z } from "@relkit/schema";
import { Effect, Option } from "effect";
import type {
  ErrorDescriptorAny,
  ErrorListOf,
  EventFunctionDescriptor,
  EventFunctionDescriptorAny,
  EventFunctionCallOptions,
  EventFunctionValidation,
  EventName,
  FunctionDependencies,
} from "./define-event-function.types.js";
import { EventDefinitionError } from "./event-errors.js";
import { observeEvent, runEventSync } from "./event-observability.js";
import {
  eventDeliveryEffect,
  eventProfileEffect,
  eventRetryEffect,
  rejectEventFunctionFieldsEffect,
} from "./event-function-validation.js";

/**
 * Defines an independent event-only consumer with inferred input and void success.
 * Event IDs are supplied by the application's generated EventRegistry.
 *
 * @example
 * ```ts
 * import { defineEvent, defineEventFunction } from "@relkit/app/events";
 * import { z } from "@relkit/app/schema";
 *
 * const orderCreated = defineEvent({
 *   id: "orders.created",
 *   input: z.object({ orderId: z.string() }),
 * });
 *
 * // The application normally generates this declaration with `relkit check`.
 * declare global {
 *   namespace Relkit {
 *     interface EventRegistry {
 *       "orders.created": typeof orderCreated;
 *     }
 *   }
 * }
 *
 * const receipt = defineEventFunction({
 *   id: "receipt.send",
 *   event: "orders.created",
 *   handler: async () => {},
 * });
 * ```
 * @category Events
 * @since 0.1.0
 * @param options - Event-only handler definition.
 * @returns A frozen event function descriptor.
 * @throws TypeError for malformed options.
 */
export function defineEventFunction<
  const Id extends string,
  const Event extends EventName,
  const Publishes extends readonly EventName[] = readonly [],
  const Dependencies extends FunctionDependencies = {},
  const Options extends EventFunctionCallOptions<Id, Event, Publishes, Dependencies> =
    EventFunctionCallOptions<Id, Event, Publishes, Dependencies>,
>(
  options: EventFunctionCallOptions<Id, Event, Publishes, Dependencies> &
    Options &
    EventFunctionValidation<NoInfer<Options>>,
): EventFunctionDescriptor<Id, Event, Publishes, Dependencies, ErrorListOf<Options>> {
  try {
    return runEventSync(defineEventFunctionEffect(options));
  } catch (error) {
    if (error instanceof EventDefinitionError) throw new TypeError(error.message);
    throw error;
  }
}

/** Defines an event-only function in Effect.
 * @param options - Event-only handler definition.
 * @returns An Effect succeeding with a descriptor or failing with EventDefinitionError.
 * @example Effect.runSync(defineEventFunctionEffect({ id: "notify", event: "orders.created", handler: () => {} }))
 */
export function defineEventFunctionEffect<
  const Id extends string,
  const Event extends EventName,
  const Publishes extends readonly EventName[] = readonly [],
  const Dependencies extends FunctionDependencies = {},
  const Options extends EventFunctionCallOptions<Id, Event, Publishes, Dependencies> =
    EventFunctionCallOptions<Id, Event, Publishes, Dependencies>,
>(
  options: EventFunctionCallOptions<Id, Event, Publishes, Dependencies> &
    Options &
    EventFunctionValidation<NoInfer<Options>>,
): Effect.Effect<
  EventFunctionDescriptor<Id, Event, Publishes, Dependencies, ErrorListOf<Options>>,
  EventDefinitionError
> {
  return observeEvent(
    "function.define",
    Effect.fn("Events.defineFunction")(function* () {
      if (!isRecord(options))
        return yield* new EventDefinitionError({
          message: "Event function options must be an object",
        });
      yield* rejectEventFunctionFieldsEffect(options);
      const event = yield* Effect.try({
        try: () => normalizeId(options.event),
        catch: (cause) =>
          new EventDefinitionError({
            message: cause instanceof Error ? cause.message : "Invalid event ID",
          }),
      });
      const delivery = yield* eventDeliveryEffect(options.delivery);
      const profile = yield* eventProfileEffect(options.profile);
      const retry = yield* eventRetryEffect(options.retry);
      return yield* Effect.try({
        try: () =>
          createFunctionDescriptor({
            ...options,
            id: options.id,
            invocationMode: "event-only",
            input: z.unknown(),
            output: z.void(),
            descriptorFields: { event, delivery, profile, retry },
          }) as EventFunctionDescriptor<Id, Event, Publishes, Dependencies, ErrorListOf<Options>>,
        catch: (cause) =>
          new EventDefinitionError({
            message: cause instanceof Error ? cause.message : "Invalid event function",
          }),
      });
    })(),
  );
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Checks an event-only function descriptor at a synchronous boundary.
 * @param value - Candidate descriptor.
 * @returns Whether it is a valid event-only function.
 * @example isEventFunctionDescriptor(candidate)
 */
export function isEventFunctionDescriptor(value: unknown): value is EventFunctionDescriptorAny {
  return runEventSync(isEventFunctionDescriptorEffect(value));
}

/** Checks an unknown value for a valid event-only function descriptor.
 * @param value - Candidate descriptor.
 * @returns An Effect succeeding with a boolean and no expected failure.
 * @example Effect.runSync(isEventFunctionDescriptorEffect(candidate))
 */
export const isEventFunctionDescriptorEffect = Effect.fn("Events.isFunctionDescriptor")(
  (value: unknown) =>
    observeEvent(
      "function.isDescriptor",
      Effect.gen(function* () {
        if (!isDescriptor(value, "function") || !isRecord(value)) return false;
        if (value.invocationMode !== "event-only" || typeof value.handler !== "function")
          return false;
        if (["invoke", "asTool", "tool", "trigger"].some((key) => key in value)) return false;
        if (typeof value.event !== "string" || value.retry === undefined) return false;
        const event = yield* Effect.option(
          Effect.try({
            try: () => normalizeId(value.event),
            catch: () => new EventDefinitionError({ message: "Invalid event ID" }),
          }),
        );
        const delivery = yield* Effect.option(eventDeliveryEffect(value.delivery));
        const profile = yield* Effect.option(eventProfileEffect(value.profile));
        const retry = yield* Effect.option(eventRetryEffect(value.retry));
        return (
          Option.isSome(event) &&
          event.value === value.event &&
          Option.isSome(delivery) &&
          delivery.value === value.delivery &&
          Option.isSome(profile) &&
          profile.value === value.profile &&
          Option.isSome(retry)
        );
      }),
    ),
);

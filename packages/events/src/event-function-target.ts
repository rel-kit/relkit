import { deepFreeze } from "@relkit/contracts";
import { Effect } from "effect";
import {
  bindDescriptorIdentity,
  getDescriptorIdentity,
  isDescriptorIdentityBound,
} from "@relkit/invocation";
import { assertEventDescriptorEffect } from "./define-event.js";
import { isEventFunctionDescriptorEffect } from "./define-event-function.js";
import { EventBindingError } from "./event-errors.js";
import { observeEvent, runEventSync } from "./event-observability.js";
import type { EventDescriptorAny, FunctionWithEvents } from "./event-function-target.types.js";

/** Binds validated event contracts into a generated function target.
 * @param descriptor - Function receiving the bindings.
 * @param consumed - Event consumed by an event-only function, if any.
 * @param published - Contracts this function may publish.
 * @returns A frozen bound target.
 * @throws TypeError if any declared contract is missing or invalid.
 * @example bindFunctionEvents(publisher, undefined, [orderCreated])
 */
export function bindFunctionEvents<T extends FunctionWithEvents>(
  descriptor: T,
  consumed: EventDescriptorAny | undefined,
  published: readonly EventDescriptorAny[],
): T {
  try {
    return runEventSync(bindFunctionEventsEffect(descriptor, consumed, published));
  } catch (error) {
    if (error instanceof EventBindingError) throw new TypeError(error.message);
    throw error;
  }
}

/** Binds event contracts with typed failures in an Effect workflow.
 * @param descriptor - Function receiving the bindings.
 * @param consumed - Event consumed by an event-only function, if any.
 * @param published - Contracts this function may publish.
 * @returns An Effect succeeding with the frozen target or failing with EventBindingError.
 * @example Effect.runSync(bindFunctionEventsEffect(publisher, undefined, [orderCreated]))
 */
export function bindFunctionEventsEffect<T extends FunctionWithEvents>(
  descriptor: T,
  consumed: EventDescriptorAny | undefined,
  published: readonly EventDescriptorAny[],
): Effect.Effect<T, EventBindingError> {
  return observeEvent(
    "function.bindEvents",
    Effect.fn("Events.bindFunctionEvents")(function* () {
      if (consumed !== undefined)
        yield* assertEventDescriptorEffect(consumed).pipe(
          Effect.mapError((error) => new EventBindingError({ message: error.message })),
        );
      for (const event of published)
        yield* assertEventDescriptorEffect(event).pipe(
          Effect.mapError((error) => new EventBindingError({ message: error.message })),
        );
      if (
        descriptor.invocationMode === "event-only" &&
        !(yield* isEventFunctionDescriptorEffect(descriptor))
      )
        return yield* new EventBindingError({
          message: `Invalid event function "${descriptor.id}"`,
        });
      if (
        descriptor.invocationMode === "event-only" &&
        (consumed === undefined || descriptor.event !== consumed.id)
      ) {
        return yield* new EventBindingError({
          message: `Event function "${descriptor.id}" has no matching event contract`,
        });
      }
      const declarations = descriptor.publishes ?? [];
      if (
        declarations.length !== published.length ||
        declarations.some((eventId) => !published.some((event) => event.id === eventId))
      ) {
        return yield* new EventBindingError({
          message: `Function "${descriptor.id}" has incomplete publication contracts`,
        });
      }
      return yield* Effect.try({
        try: () => {
          const target = deepFreeze(
            Object.defineProperties(
              {},
              {
                ...Object.getOwnPropertyDescriptors(descriptor),
                ...(consumed === undefined
                  ? {}
                  : { input: { value: consumed.input, enumerable: true } }),
                publications: {
                  value: Object.fromEntries(published.map((event) => [event.id, event])),
                  enumerable: true,
                },
              },
            ),
          ) as T;
          if (isDescriptorIdentityBound(descriptor))
            bindDescriptorIdentity(target, getDescriptorIdentity(descriptor));
          return target;
        },
        catch: (cause) =>
          new EventBindingError({
            message: cause instanceof Error ? cause.message : "Event binding failed",
          }),
      });
    })(),
  );
}

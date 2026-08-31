import { isDescriptor, normalizeId } from "@relkit/contracts";
import {
  type ErrorDescriptorAny,
  type FunctionDependencies,
  type FunctionHandlerValidation,
} from "@relkit/functions";
import { createFunctionDescriptor } from "@relkit/functions/internal";
import { z } from "@relkit/schema";
import type { EventInputByName, EventName } from "./event-registry.js";
import type {
  DefineEventFunctionOptions,
  EventFunctionContext,
  EventFunctionDescriptor,
  EventFunctionDescriptorAny,
} from "./event-function-types.js";
import {
  eventDelivery,
  eventProfile,
  eventRetry,
  rejectEventFunctionFields,
} from "./event-function-validation.js";

type ErrorListOf<Options> = Options extends {
  readonly errors: infer Errors extends readonly ErrorDescriptorAny[];
}
  ? Errors
  : readonly [];

type EventFunctionCallOptions<
  Id extends string,
  Event extends EventName,
  Publishes extends readonly EventName[],
  Dependencies extends FunctionDependencies,
> = Omit<
  DefineEventFunctionOptions<Id, Event, Publishes, Dependencies, readonly ErrorDescriptorAny[]>,
  "handler"
> & {
  readonly handler: (
    input: EventInputByName<Event>,
    context: EventFunctionContext<Event, Publishes, Dependencies>,
  ) => unknown;
};

type EventFunctionValidation<Options extends { readonly handler: (...args: never[]) => unknown }> =
  FunctionHandlerValidation<Awaited<ReturnType<Options["handler"]>>, void, ErrorListOf<Options>>;

/**
 * Defines an independent event-only consumer with inferred input and void success.
 * Event IDs are supplied by the application's generated EventRegistry.
 *
 * @example
 * ```ts
 * import { defineEventFunction } from "@relkit/app/events"
 *
 * // Pass { id, event, handler } after generating the application's event registry.
 * // Consumers can publish only events explicitly listed in their publishes option.
 * void defineEventFunction
 * ```
 * @category Events
 * @since 0.1.0
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
  if (!isRecord(options)) throw new TypeError("Event function options must be an object");
  rejectEventFunctionFields(options as unknown as Record<PropertyKey, unknown>);
  const event = normalizeId(options.event);
  const delivery = eventDelivery(options.delivery);
  const profile = eventProfile(options.profile);
  const retry = eventRetry(options.retry);
  return createFunctionDescriptor({
    ...options,
    id: options.id,
    invocationMode: "event-only",
    input: z.unknown(),
    output: z.void(),
    descriptorFields: { event, delivery, profile, retry },
  }) as EventFunctionDescriptor<Id, Event, Publishes, Dependencies, ErrorListOf<Options>>;
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isEventFunctionDescriptor(value: unknown): value is EventFunctionDescriptorAny {
  if (!isDescriptor(value, "function") || !isRecord(value)) return false;
  if (value.invocationMode !== "event-only" || typeof value.handler !== "function") return false;
  if (["invoke", "asTool", "tool", "trigger"].some((key) => key in value)) return false;
  if (typeof value.event !== "string") return false;
  try {
    return (
      normalizeId(value.event) === value.event &&
      eventDelivery(value.delivery) === value.delivery &&
      eventProfile(value.profile) === value.profile &&
      value.retry !== undefined &&
      !!eventRetry(value.retry)
    );
  } catch {
    return false;
  }
}

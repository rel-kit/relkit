import { createDescriptorBase, deepFreeze } from "@relkit/contracts";
import { defineFunction, type FunctionContext, type FunctionDependencies } from "@relkit/functions";
import { z } from "@relkit/schema";
import type { UnknownEventEnvelope } from "./define-event.js";
import type { EventName } from "./event-registry.js";
import type {
  EventListenerContext,
  EventListenerHandler,
  EventListenerMetadata,
  EventTriggerDescriptor,
  OnEventOptions,
} from "./listener-types.js";
import { delivery, isRecord, optionalId, positive, retryPolicy } from "./listener-validation.js";
import { copyEventSelector, isEventSelector, single } from "./selectors.js";
import type {
  EventSelectorAny,
  EventSelectorInput,
  SingleEventSelector,
} from "./selector-types.js";

const pendingListenerId = "relkit.event.listener.pending";

/**
 * Registers a typed callback for an event name or selector. Each matching
 * listener is an independent delivery: one listener may fail without rolling
 * back another, and durable delivery is at-least-once rather than a transaction.
 * Listener IDs may be inferred from source bindings; declared error retry hints
 * constrain durable redelivery without changing direct invocation behavior.
 *
 * @example
 * ```ts
 * import { events, onEvent } from "@relkit/events"
 *
 * const audit = onEvent(events.all({ payload: "unknown", purpose: "audit" }), async (event, ctx) => {
 *   ctx.log.info("event received", { eventId: event.eventId })
 * })
 * void audit
 * ```
 * @category Events
 * @since 0.1.0
 */
export function onEvent<
  const Name extends EventName,
  const Id extends string = string,
  const Dependencies extends FunctionDependencies = {},
>(
  name: Name,
  handler: EventListenerHandler<EventSelectorInput<SingleEventSelector<Name>>, Dependencies>,
  options?: OnEventOptions<Id, Dependencies>,
): EventTriggerDescriptor<Id, SingleEventSelector<Name>, Dependencies>;
export function onEvent<
  const Selector extends EventSelectorAny,
  const Id extends string = string,
  const Dependencies extends FunctionDependencies = {},
>(
  selector: Selector,
  handler: EventListenerHandler<EventSelectorInput<Selector>, Dependencies>,
  options?: OnEventOptions<Id, Dependencies>,
): EventTriggerDescriptor<Id, Selector, Dependencies>;
export function onEvent(
  source: string | EventSelectorAny,
  handler: EventListenerHandler<any, any>,
  options: OnEventOptions<string, any> = {},
): EventTriggerDescriptor<any, any, any> {
  if (typeof handler !== "function")
    throw new TypeError("onEvent requires a callback as its second argument");
  if (!isRecord(options)) throw new TypeError("Event listener options must be an object");
  const selector =
    typeof source === "string"
      ? single(source as EventName)
      : isEventSelector(source)
        ? copyEventSelector(source)
        : invalidSource();
  const explicitId = optionalId(options.id);
  const id = explicitId ?? pendingListenerId;
  const selectedDelivery = delivery(options.delivery);
  const profile = optionalId(options.profile);
  const retry = retryPolicy(options.retry);
  const concurrency = positive(options.concurrency, "concurrency");
  const timeoutMs = positive(options.timeoutMs, "timeoutMs");
  const target = defineFunction({
    id: eventListenerFunctionId(id),
    input: z.unknown(),
    output: z.unknown(),
    ...(options.dependencies === undefined ? {} : { dependencies: options.dependencies }),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    ...(concurrency === undefined ? {} : { concurrency }),
    handler: (input, context) => {
      const envelope = input as UnknownEventEnvelope;
      return handler(listenerInput(selector, envelope), listenerContext(context, envelope));
    },
  });
  const base = createDescriptorBase("event-trigger", id, options);
  return deepFreeze({
    ...base,
    selector,
    target,
    delivery: selectedDelivery,
    callback: true as const,
    inferredId: explicitId === undefined,
    ...(profile === undefined ? {} : { profile }),
    ...(retry === undefined ? {} : { retry }),
    ...(concurrency === undefined ? {} : { concurrency }),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  }) as EventTriggerDescriptor;
}

export function eventListenerFunctionId(listenerId: string): string {
  return `relkit.event.${listenerId}.handler`;
}

export function isEventTriggerDescriptor(value: unknown): value is EventTriggerDescriptor {
  return (
    isRecord(value) &&
    value.kind === "event-trigger" &&
    value.callback === true &&
    isEventSelector(value.selector) &&
    isRecord(value.target) &&
    typeof value.target.handler === "function" &&
    (value.delivery === "ephemeral" || value.delivery === "durable")
  );
}

function listenerInput(selector: EventSelectorAny, envelope: UnknownEventEnvelope): unknown {
  return selector.kind === "single" ? envelope.payload : envelope;
}

function listenerContext(
  context: FunctionContext<FunctionDependencies>,
  envelope: UnknownEventEnvelope,
): EventListenerContext<FunctionDependencies> {
  const event: EventListenerMetadata = Object.freeze({
    eventId: envelope.eventId,
    version: envelope.version,
    instanceId: envelope.instanceId,
    ...(envelope.key === undefined ? {} : { key: envelope.key }),
    attributes: envelope.attributes,
    occurredAt: envelope.occurredAt,
    traceId: envelope.traceId,
    ...(envelope.correlationId === undefined ? {} : { correlationId: envelope.correlationId }),
    ...(envelope.causationInvocationId === undefined
      ? {}
      : { causationInvocationId: envelope.causationInvocationId }),
  });
  return Object.freeze({ ...context, event });
}

function invalidSource(): never {
  throw new TypeError("onEvent requires an event name or selector");
}

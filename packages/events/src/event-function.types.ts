import type { DescriptorBase, DescriptorMetadata, MaybePromise } from "@relkit/contracts";
import type {
  ErrorDescriptorAny,
  FunctionContext,
  FunctionDependencies,
  FunctionHandlerResult,
} from "@relkit/functions";
import type { RetryPolicy } from "@relkit/jobs/legacy";
import type { InferOutput } from "@relkit/schema";
import type {
  EventDescriptorByName,
  EventInputByName,
  EventName,
  EventVersionByName,
} from "./event-registry.js";

/** Delivery semantics for an event-only function.
 * @example const delivery: EventDelivery = "durable"
 */
export type EventDelivery = "ephemeral" | "durable";

/** Bounded retry policy shared with job handlers.
 * @example const retry: EventRetryPolicy = { maxAttempts: 1, initialDelayMs: 0, maxDelayMs: 0, multiplier: 1, jitter: "none" }
 */
export type EventRetryPolicy = RetryPolicy;

/** Trigger metadata supplied for one event delivery.
 * @example const attempt = context.trigger.delivery.attempt
 */
export interface EventFunctionTrigger<Event extends EventName = EventName> {
  readonly kind: "event";
  readonly event: {
    readonly id: Event;
    readonly version: EventVersionByName<Event>;
    readonly instanceId: string;
    readonly occurredAt: string;
    readonly publishedAt: string;
    readonly key?: string;
    readonly attributes: Readonly<Record<string, string | number | boolean>>;
  };
  readonly delivery: { readonly attempt: number; readonly replayed: boolean };
  readonly trace: {
    readonly traceId: string;
    readonly correlationId?: string;
    readonly causationInvocationId?: string;
  };
}

/** Handler context with event trigger and declared dependencies.
 * @example const eventId = context.trigger.event.id
 */
export interface EventFunctionContext<
  Event extends EventName,
  Publishes extends readonly EventName[] = readonly [],
  Dependencies extends FunctionDependencies = {},
> extends FunctionContext<Dependencies, Publishes> {
  readonly trigger: EventFunctionTrigger<Event>;
}

/** Handler contract for event-only functions; successful handlers return void.
 * @example const handler: EventFunctionHandler<"orders.created", [], {}, []> = () => {}
 */
export type EventFunctionHandler<
  Event extends EventName,
  Publishes extends readonly EventName[],
  Dependencies extends FunctionDependencies,
  Errors extends readonly ErrorDescriptorAny[],
> = (
  input: EventInputByName<Event>,
  context: EventFunctionContext<Event, Publishes, Dependencies>,
) => MaybePromise<FunctionHandlerResult<void, Errors>>;

/** Definition options for a versioned event consumer.
 * @example const options = { id: "receipt.send", event: "orders.created", handler: () => {} }
 */
export interface DefineEventFunctionOptions<
  Id extends string,
  Event extends EventName,
  Publishes extends readonly EventName[] = readonly [],
  Dependencies extends FunctionDependencies = {},
  Errors extends readonly ErrorDescriptorAny[] = readonly [],
> extends DescriptorMetadata {
  readonly id: Id;
  readonly event: Event;
  readonly delivery?: EventDelivery;
  readonly profile?: string;
  readonly retry?: Partial<EventRetryPolicy>;
  readonly concurrency?: number;
  readonly timeoutMs?: number;
  readonly publishes?: Publishes;
  readonly dependencies?: Dependencies;
  readonly errors?: Errors;
  readonly onBefore?: (
    input: EventInputByName<Event>,
    context: EventFunctionContext<Event, Publishes, Dependencies>,
  ) => MaybePromise<EventInputByName<Event>>;
  readonly onAfter?: (
    output: void,
    context: EventFunctionContext<Event, Publishes, Dependencies>,
  ) => MaybePromise<void>;
  readonly handler: EventFunctionHandler<Event, Publishes, Dependencies, Errors>;
  readonly input?: never;
  readonly output?: never;
  readonly tool?: never;
  readonly trigger?: never;
}

/** Immutable descriptor emitted by defineEventFunction.
 * @example const descriptor = defineEventFunction(options)
 */
export interface EventFunctionDescriptor<
  Id extends string = string,
  Event extends EventName = EventName,
  Publishes extends readonly EventName[] = readonly [],
  Dependencies extends FunctionDependencies = {},
  Errors extends readonly ErrorDescriptorAny[] = readonly ErrorDescriptorAny[],
> extends DescriptorBase<"function", Id> {
  readonly invocationMode: "event-only";
  readonly event: Event;
  readonly delivery: EventDelivery;
  readonly profile: string;
  readonly retry: EventRetryPolicy;
  readonly concurrency?: number;
  readonly timeoutMs?: number;
  readonly publishes?: Publishes;
  readonly dependencies?: Dependencies;
  readonly errors?: Errors;
  readonly handler: EventFunctionHandler<Event, Publishes, Dependencies, Errors>;
  readonly invoke?: never;
  readonly asTool?: never;
  readonly __input?: InferOutput<EventDescriptorByName<Event>["input"]>;
}

/** Event-only descriptor with erased event and dependency types.
 * @example const consumer: EventFunctionDescriptorAny = descriptor
 */
export interface EventFunctionDescriptorAny extends DescriptorBase<"function"> {
  readonly invocationMode: "event-only";
  readonly event: string;
  readonly delivery: EventDelivery;
  readonly profile: string;
  readonly retry: EventRetryPolicy;
  readonly concurrency?: number;
  readonly timeoutMs?: number;
  readonly publishes?: readonly string[];
  readonly handler: (...args: never[]) => unknown;
}

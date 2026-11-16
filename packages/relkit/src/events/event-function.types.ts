import type {
  DescriptorBase,
  DescriptorMetadata,
  MaybePromise,
  ProviderProfileName,
} from "../contracts/index.js";
import type {
  ErrorDescriptorAny,
  FunctionContext,
  FunctionDependencies,
  FunctionHandlerResult,
} from "../functions/index.js";
import type { RetryPolicy } from "../jobs/job.types.js";
import type { InferOutput } from "../schema/index.js";
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
  Dependencies extends FunctionDependencies = {},
> extends FunctionContext<Dependencies> {
  readonly trigger: EventFunctionTrigger<Event>;
}

/** Handler contract for event-only functions; successful handlers return void.
 * @example const handler: EventFunctionHandler<"orders.created", [], {}, []> = () => {}
 */
export type EventFunctionHandler<
  Event extends EventName,
  Dependencies extends FunctionDependencies,
  Errors extends readonly ErrorDescriptorAny[],
> = (
  input: EventInputByName<Event>,
  context: EventFunctionContext<Event, Dependencies>,
) => MaybePromise<FunctionHandlerResult<void, Errors>>;

/** Definition options for a versioned event consumer.
 * @example const options = { id: "receipt.send", event: "orders.created", handler: () => {} }
 */
export interface DefineEventFunctionOptions<
  Id extends string,
  Event extends EventName,
  Dependencies extends FunctionDependencies = {},
  Errors extends readonly ErrorDescriptorAny[] = readonly [],
> extends DescriptorMetadata {
  /** Stable ID of the function; each consumer of the same event needs its own. */
  readonly id: Id;
  /** ID of the event to consume, such as `orders.created`. */
  readonly event: Event;
  /** `"durable"` (default) stores and retries each delivery; `"ephemeral"` keeps nothing. */
  readonly delivery?: EventDelivery;
  /** The event provider profile whose deliveries the function handles. */
  readonly profile?: ProviderProfileName<"event">;
  /** Retry policy for failed durable deliveries. Defaults to one attempt, so no retry. */
  readonly retry?: Partial<EventRetryPolicy>;
  /** Most deliveries of the event that this function handles at once. */
  readonly concurrency?: number;
  /** Time limit in milliseconds for handling one delivery. */
  readonly timeoutMs?: number;
  /** Everything the handler calls, by kind; each entry becomes a client on `context`. */
  readonly dependencies?: Dependencies;
  /** Declared errors the handler may return. */
  readonly errors?: Errors;
  /** Runs before the handler and may replace the event's data. */
  readonly onBefore?: (
    input: EventInputByName<Event>,
    context: EventFunctionContext<Event, Dependencies>,
  ) => MaybePromise<EventInputByName<Event>>;
  /** Runs after the handler succeeds. */
  readonly onAfter?: (
    output: void,
    context: EventFunctionContext<Event, Dependencies>,
  ) => MaybePromise<void>;
  /** Handles one delivery: receives the event's data and `context`, returns nothing. */
  readonly handler: EventFunctionHandler<Event, Dependencies, Errors>;
  /** Not an option here: the input is the data of the consumed event. */
  readonly input?: never;
  /** Not an option here: an event function returns nothing. */
  readonly output?: never;
  /** Not an option here: an event function cannot become a tool. */
  readonly tool?: never;
  /** Not an option here: `event` names what starts the function. */
  readonly trigger?: never;
}

/** Immutable descriptor emitted by defineEventFunction.
 * @example const descriptor = defineEventFunction(options)
 */
export interface EventFunctionDescriptor<
  Id extends string = string,
  Event extends EventName = EventName,
  Dependencies extends FunctionDependencies = {},
  Errors extends readonly ErrorDescriptorAny[] = readonly ErrorDescriptorAny[],
> extends DescriptorBase<"function", Id> {
  readonly invocationMode: "event-only";
  readonly event: Event;
  readonly delivery: EventDelivery;
  /** The profile the definition names; absent when the application's default applies. */
  readonly profile?: string;
  readonly retry: EventRetryPolicy;
  readonly concurrency?: number;
  readonly timeoutMs?: number;
  readonly dependencies?: Dependencies;
  readonly errors?: Errors;
  readonly handler: EventFunctionHandler<Event, Dependencies, Errors>;
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
  /** The profile the definition names; absent when the application's default applies. */
  readonly profile?: string;
  readonly retry: EventRetryPolicy;
  readonly concurrency?: number;
  readonly timeoutMs?: number;
  readonly handler: (...args: never[]) => unknown;
}

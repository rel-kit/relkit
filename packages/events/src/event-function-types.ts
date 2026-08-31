import type { DescriptorBase, DescriptorMetadata, MaybePromise } from "@relkit/contracts";
import type {
  ErrorDescriptorAny,
  FunctionContext,
  FunctionDependencies,
  FunctionHandlerResult,
} from "@relkit/functions";
import type { RetryPolicy } from "@relkit/jobs";
import type { InferOutput } from "@relkit/schema";
import type {
  EventDescriptorByName,
  EventInputByName,
  EventName,
  EventVersionByName,
} from "./event-registry.js";

export type EventDelivery = "ephemeral" | "durable";
export type EventRetryPolicy = RetryPolicy;

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

export interface EventFunctionContext<
  Event extends EventName,
  Publishes extends readonly EventName[] = readonly [],
  Dependencies extends FunctionDependencies = {},
> extends FunctionContext<Dependencies, Publishes> {
  readonly trigger: EventFunctionTrigger<Event>;
}

export type EventFunctionHandler<
  Event extends EventName,
  Publishes extends readonly EventName[],
  Dependencies extends FunctionDependencies,
  Errors extends readonly ErrorDescriptorAny[],
> = (
  input: EventInputByName<Event>,
  context: EventFunctionContext<Event, Publishes, Dependencies>,
) => MaybePromise<FunctionHandlerResult<void, Errors>>;

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

import type { DescriptorBase, DescriptorMetadata, MaybePromise } from "@relkit/contracts";
import type {
  EventAttributeValue,
  FunctionContext,
  FunctionDependencies,
  FunctionDescriptor,
} from "@relkit/functions";
import type { RetryPolicy } from "@relkit/jobs";
import type { UnknownEventEnvelope } from "./define-event.js";
import type { EventSelectorAny, EventSelectorInput } from "./selector-types.js";

export type EventDelivery = "ephemeral" | "durable";

export interface EventListenerMetadata {
  readonly eventId: string;
  readonly version: number;
  readonly instanceId: string;
  readonly key?: string;
  readonly attributes: Readonly<Record<string, EventAttributeValue>>;
  readonly occurredAt: string;
  readonly traceId: string;
  readonly correlationId?: string;
  readonly causationInvocationId?: string;
}

export interface EventListenerContext<
  Dependencies extends FunctionDependencies = {},
> extends FunctionContext<Dependencies> {
  readonly event: EventListenerMetadata;
}

export type EventListenerHandler<Input, Dependencies extends FunctionDependencies = {}> = (
  payload: Input,
  context: EventListenerContext<Dependencies>,
) => MaybePromise<unknown>;

export type EventListenerTarget<Dependencies extends FunctionDependencies> = FunctionDescriptor<
  string,
  UnknownEventEnvelope,
  unknown,
  Dependencies
>;

type FunctionDependencyOptions<D extends FunctionDependencies> = "functions" extends keyof D
  ? never
  : D;

export interface EventTriggerDescriptor<
  Id extends string = string,
  Selector extends EventSelectorAny = EventSelectorAny,
  Dependencies extends FunctionDependencies = FunctionDependencies,
> extends DescriptorBase<"event-trigger", Id> {
  readonly selector: Selector;
  readonly target: EventListenerTarget<Dependencies>;
  readonly delivery: EventDelivery;
  readonly profile?: string;
  readonly retry?: RetryPolicy;
  readonly concurrency?: number;
  readonly timeoutMs?: number;
  readonly callback: true;
  readonly inferredId: boolean;
  readonly __input?: EventSelectorInput<Selector>;
}

export interface OnEventOptions<
  Id extends string = string,
  Dependencies extends FunctionDependencies = {},
> extends DescriptorMetadata {
  readonly id?: Id;
  readonly delivery?: EventDelivery;
  readonly profile?: string;
  readonly retry?: RetryPolicy;
  readonly concurrency?: number;
  readonly timeoutMs?: number;
  readonly dependencies?: FunctionDependencyOptions<Dependencies>;
}

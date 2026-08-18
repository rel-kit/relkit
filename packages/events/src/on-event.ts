import {
  createDescriptorBase,
  deepFreeze,
  isRef,
  normalizeId,
  type DescriptorBase,
  type DescriptorMetadata,
} from "@zsys/contracts";
import type { ErrorDescriptorAny, FunctionRef, FunctionRefAny } from "@zsys/functions";
import type { RetryPolicy } from "@zsys/jobs";
import type { EventDescriptor, EventDescriptorAny } from "./define-event.js";
import { isEventDescriptor } from "./define-event.js";
import {
  single,
  copyEventSelector,
  isEventSelector,
  type EventSelectorAny,
  type EventSelectorInput,
} from "./selectors.js";
import type { SingleEventSelector } from "./selectors.js";

export type EventDelivery = "ephemeral" | "durable";

export type EventTriggerTarget<Target extends FunctionRefAny> = FunctionRef<
  Target["ref"]["id"],
  Target extends { readonly __input?: infer Input } ? Input : unknown,
  Target extends { readonly __output?: infer Output } ? Output : unknown,
  readonly ErrorDescriptorAny[],
  Target["input"],
  Target["output"]
>;

export interface EventTriggerDescriptor<
  Id extends string,
  Selector extends EventSelectorAny = EventSelectorAny,
  Target extends FunctionRefAny = FunctionRefAny,
> extends DescriptorBase<"event-trigger", Id> {
  readonly selector: Selector;
  readonly target: EventTriggerTarget<Target>;
  readonly delivery: EventDelivery;
  readonly profile?: string;
  readonly retry?: RetryPolicy;
  readonly concurrency?: number;
  readonly __input?: EventSelectorInput<Selector>;
}

export interface OnEventOptions<
  Id extends string,
  Target extends FunctionRefAny,
> extends DescriptorMetadata {
  readonly id: Id;
  readonly target: Target;
  readonly delivery: EventDelivery;
  readonly profile?: string;
  readonly retry?: RetryPolicy;
  readonly concurrency?: number;
}

export function onEvent<
  const Event extends EventDescriptorAny,
  const Id extends string,
  const Target extends FunctionRefAny,
>(
  event: Event,
  options: OnEventOptions<Id, Target>,
): EventTriggerDescriptor<Id, SingleEventSelector<Event>, Target>;
export function onEvent<
  const Selector extends EventSelectorAny,
  const Id extends string,
  const Target extends FunctionRefAny,
>(
  selector: Selector,
  options: OnEventOptions<Id, Target>,
): EventTriggerDescriptor<Id, Selector, Target>;
export function onEvent(
  source: EventDescriptorAny | EventSelectorAny,
  options: OnEventOptions<string, FunctionRefAny>,
): EventTriggerDescriptor<string> {
  if (!isRecord(options)) throw new TypeError("Event trigger options must be an object");
  if (hasOwn(options, "handler")) throw new TypeError("Event triggers cannot own handlers");
  const selector = isEventSelector(source)
    ? copyEventSelector(source)
    : isEventDescriptor(source)
      ? single(source)
      : (() => {
          throw new TypeError("onEvent requires an event descriptor or selector");
        })();
  const target = copyFunctionTarget(options.target);
  const delivery = validateDelivery(options.delivery);
  const profile = options.profile === undefined ? undefined : normalizeId(options.profile);
  const retry = options.retry === undefined ? undefined : copyRetry(options.retry);
  if (options.concurrency !== undefined)
    validatePositiveInteger(options.concurrency, "concurrency");
  const base = createDescriptorBase("event-trigger", options.id, options);

  return deepFreeze({
    ...base,
    selector,
    target,
    delivery,
    ...(profile === undefined ? {} : { profile }),
    ...(retry === undefined ? {} : { retry }),
    ...(options.concurrency === undefined ? {} : { concurrency: options.concurrency }),
  }) as EventTriggerDescriptor<string>;
}

export function isEventTriggerDescriptor(value: unknown): value is EventTriggerDescriptor<string> {
  if (!isRecord(value) || value.kind !== "event-trigger") return false;
  return (
    isEventSelector(value.selector) &&
    isFunctionTarget(value.target) &&
    (value.delivery === "ephemeral" || value.delivery === "durable")
  );
}

function copyFunctionTarget<Target extends FunctionRefAny>(
  target: Target,
): EventTriggerTarget<Target> {
  if (!isFunctionTarget(target))
    throw new TypeError("Event trigger target must be a function reference");
  return deepFreeze({
    ref: Object.freeze({ kind: "function" as const, id: target.ref.id }),
    input: target.input,
    output: target.output,
    ...(target.errors === undefined ? {} : { errors: Object.freeze([...target.errors]) }),
  }) as EventTriggerTarget<Target>;
}

function copyRetry(value: RetryPolicy): RetryPolicy {
  if (!isRecord(value)) throw new TypeError("Event retry policy must be an object");
  validatePositiveInteger(value.maxAttempts, "retry.maxAttempts");
  validateNonNegativeInteger(value.initialDelayMs, "retry.initialDelayMs");
  validateNonNegativeInteger(value.maxDelayMs, "retry.maxDelayMs");
  if (value.maxDelayMs < value.initialDelayMs)
    throw new TypeError("retry.maxDelayMs must be at least retry.initialDelayMs");
  if (
    typeof value.multiplier !== "number" ||
    !Number.isFinite(value.multiplier) ||
    value.multiplier < 1
  )
    throw new TypeError("retry.multiplier must be a finite number at least 1");
  if (value.jitter !== "none" && value.jitter !== "full" && value.jitter !== "equal")
    throw new TypeError("retry.jitter must be none, full, or equal");
  return Object.freeze({
    maxAttempts: value.maxAttempts,
    initialDelayMs: value.initialDelayMs,
    maxDelayMs: value.maxDelayMs,
    multiplier: value.multiplier,
    jitter: value.jitter,
  });
}

function validateDelivery(value: unknown): EventDelivery {
  if (value !== "ephemeral" && value !== "durable")
    throw new TypeError("Event delivery must be ephemeral or durable");
  return value;
}

function validatePositiveInteger(value: unknown, name: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 1)
    throw new TypeError(`${name} must be a positive integer`);
}

function validateNonNegativeInteger(value: unknown, name: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new TypeError(`${name} must be a non-negative integer`);
}

function isFunctionTarget(value: unknown): value is FunctionRefAny {
  return (
    isRecord(value) &&
    isRef(value.ref, "function") &&
    isSchema(value.input) &&
    isSchema(value.output)
  );
}

function isSchema(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value["~standard"])) return false;
  return value["~standard"].version === 1 && typeof value["~standard"].validate === "function";
}

function isRecord(value: unknown): value is Record<PropertyKey, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export type { FunctionRef };

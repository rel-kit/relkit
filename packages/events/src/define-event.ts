import {
  createDescriptorBase,
  deepFreeze,
  isDescriptor,
  type DescriptorBase,
  type DescriptorMetadata,
} from "@relkit/contracts";
import type { EventPublishResult, EventRef } from "@relkit/functions";
import { type InferOutput, type StandardSchemaV1 } from "@relkit/schema";

export type EventEnvelope<
  Id extends string = string,
  Version extends number = number,
  Payload = unknown,
> = Omit<EventPublishResult<Id, Version, Payload>, "accepted">;

export type UnknownEventEnvelope = EventEnvelope<string, number, unknown>;

export type EventEnvelopeFor<E> =
  E extends EventDescriptor<infer Id, infer Version, infer Input, StandardSchemaV1>
    ? EventEnvelope<Id, Version, Input>
    : UnknownEventEnvelope;

export interface EventDescriptor<
  Id extends string,
  Version extends number,
  Input,
  InputSchema extends StandardSchemaV1 = StandardSchemaV1,
>
  extends DescriptorBase<"event", Id>, EventRef<Id, InputSchema> {
  readonly version: Version;
  readonly input: InputSchema;
  readonly sensitiveFields?: readonly string[];
  readonly handler?: never;
  readonly output?: never;
  readonly __input?: Input;
}

export type EventDescriptorAny = EventDescriptor<string, number, unknown, StandardSchemaV1>;

export interface DefineEventOptions<
  Id extends string,
  Version extends number,
  InputSchema extends StandardSchemaV1,
> extends DescriptorMetadata {
  readonly id: Id;
  readonly version?: Version;
  readonly input: InputSchema;
  readonly sensitiveFields?: readonly string[];
  readonly handler?: never;
  readonly output?: never;
}

/**
 * Defines a versioned event contract used by publishers and event functions.
 *
 * @example
 * ```ts
 * import { defineEvent } from "@relkit/app/events"
 * import { z } from "@relkit/app/schema"
 *
 * const created = defineEvent({ id: "orders.created", input: z.object({ orderId: z.string() }) })
 * void created
 * ```
 * @category Events
 * @since 0.1.0
 */
export function defineEvent<
  const Id extends string,
  const Version extends number = 1,
  const InputSchema extends StandardSchemaV1 = StandardSchemaV1,
>(
  options: DefineEventOptions<Id, Version, InputSchema>,
): EventDescriptor<Id, Version, InferOutput<InputSchema>, InputSchema> {
  if (!isRecord(options)) throw new TypeError("Event options must be an object");
  if (hasOwn(options, "handler")) throw new TypeError("Events cannot own handlers");
  if (hasOwn(options, "output")) throw new TypeError("Events cannot own outputs");
  if (!isSchema(options.input))
    throw new TypeError("Event input must be a Standard Schema v1 validator");
  const version = options.version ?? 1;
  validateVersion(version);
  const sensitiveFields = copySensitiveFields(options.sensitiveFields);
  const base = createDescriptorBase("event", options.id, options);

  return deepFreeze({
    ...base,
    version,
    input: options.input,
    ...(sensitiveFields === undefined ? {} : { sensitiveFields }),
  }) as EventDescriptor<Id, Version, InferOutput<InputSchema>, InputSchema>;
}

export function isEventDescriptor(value: unknown): value is EventDescriptorAny {
  if (!isDescriptor(value, "event") || !isRecord(value)) return false;
  return (
    isSchema(value.input) &&
    isPositiveInteger(value.version) &&
    !hasOwn(value, "handler") &&
    !hasOwn(value, "output")
  );
}

export function assertEventDescriptor(value: unknown): asserts value is EventDescriptorAny {
  if (!isEventDescriptor(value)) throw new TypeError("Invalid event descriptor");
}

function copySensitiveFields(value: readonly string[] | undefined): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new TypeError("Event sensitiveFields must be an array");
  const fields = value.map((field) => {
    if (typeof field !== "string" || field.trim() === "")
      throw new TypeError("Event sensitive fields must be non-empty strings");
    return field.trim();
  });
  if (new Set(fields).size !== fields.length)
    throw new TypeError("Event sensitive fields must be unique");
  return Object.freeze(fields);
}

function validateVersion(value: unknown): asserts value is number {
  if (!isPositiveInteger(value)) throw new TypeError("Event version must be a positive integer");
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isSchema(value: unknown): value is StandardSchemaV1 {
  if (!isRecord(value) || !isRecord(value["~standard"])) return false;
  return value["~standard"].version === 1 && typeof value["~standard"].validate === "function";
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

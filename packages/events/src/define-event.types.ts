import type { DescriptorBase, DescriptorMetadata } from "@relkit/contracts";
import type { EventPublishResult, EventRef } from "@relkit/functions";
import type { StandardSchemaV1 } from "@relkit/schema";
export type { InferOutput, StandardSchemaV1 } from "@relkit/schema";

/** Published event data without the provider acceptance flag.
 * @example type Created = EventEnvelope<"orders.created", 1, { orderId: string }>
 */
export type EventEnvelope<
  Id extends string = string,
  Version extends number = number,
  Payload = unknown,
> = Omit<EventPublishResult<Id, Version, Payload>, "accepted">;

/** Event data when its contract is not known statically.
 * @example const envelope: UnknownEventEnvelope = received
 */
export type UnknownEventEnvelope = EventEnvelope<string, number, unknown>;

/** Resolves the envelope for a specific event descriptor.
 * @example type CreatedEnvelope = EventEnvelopeFor<typeof created>
 */
export type EventEnvelopeFor<E> =
  E extends EventDescriptor<infer Id, infer Version, infer Input, StandardSchemaV1>
    ? EventEnvelope<Id, Version, Input>
    : UnknownEventEnvelope;

/** Immutable, versioned event contract with no handler or output.
 * @example const created: EventDescriptor<"orders.created", 1, { orderId: string }> = defineEvent(options)
 */
export interface EventDescriptor<
  Id extends string,
  Version extends number,
  Input,
  InputSchema extends StandardSchemaV1 = StandardSchemaV1,
>
  extends DescriptorBase<"event", Id>, EventRef<Id, InputSchema> {
  readonly version: Version;
  readonly input: InputSchema;
  readonly profile?: string;
  readonly sensitiveFields?: readonly string[];
  readonly handler?: never;
  readonly output?: never;
  readonly __input?: Input;
}

/** Event descriptor with erased contract parameters.
 * @example const registry: EventDescriptorAny[] = [created]
 */
export type EventDescriptorAny = EventDescriptor<string, number, unknown, StandardSchemaV1>;

/** Input accepted by the event descriptor factory.
 * @example const options: DefineEventOptions<"orders.created", 1, typeof schema> = { id: "orders.created", input: schema }
 */
export interface DefineEventOptions<
  Id extends string,
  Version extends number,
  InputSchema extends StandardSchemaV1,
> extends DescriptorMetadata {
  readonly id: Id;
  readonly version?: Version;
  readonly input: InputSchema;
  readonly profile?: string;
  readonly sensitiveFields?: readonly string[];
  readonly handler?: never;
  readonly output?: never;
}

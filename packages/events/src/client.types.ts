import type { MaybePromise, TracePropagation } from "@relkit/contracts";
import type { EventPublishOptions, EventPublishResult } from "@relkit/functions";
import type { StandardSchemaV1 } from "@relkit/schema";
export type {
  EventAttributeValue,
  EventPublishOptions,
  EventPublishResult,
} from "@relkit/functions";
export type { InferInput, InferOutput, StandardSchemaV1 } from "@relkit/schema";

/** Context passed to the selected event provider for one publication.
 * The signal remains valid until the publication settles.
 * @example const id = context.eventId
 */
export interface EventOperationContext {
  readonly operation: "publish";
  readonly eventId: string;
  readonly version: number;
  readonly signal: AbortSignal;
  readonly profile: string;
  readonly deadlineMs?: number;
  readonly propagation?: TracePropagation;
}

/** Provider acknowledgement and optional envelope metadata.
 * @example const result: EventProviderResult = { accepted: true, instanceId: "event-1" }
 */
export type EventProviderResult<
  Id extends string = string,
  Version extends number = number,
  Payload = unknown,
> = Pick<EventPublishResult<Id, Version, Payload>, "instanceId" | "accepted"> &
  Partial<Omit<EventPublishResult<Id, Version, Payload>, "instanceId" | "accepted">>;

/** Provider interface selected from a profile for publication.
 * @example const provider: EventProvider = { publish: async () => ({ accepted: true, instanceId: "event-1" }) }
 */
export interface EventProvider {
  /** Publishes one validated payload.
   * @param payload - Decoded event payload.
   * @param options - Validated publish options.
   * @param context - Trace and cancellation context.
   * @returns Provider acceptance and metadata, or a rejected Promise.
   * @example await provider.publish(payload, {}, context)
   */
  readonly publish: (
    payload: unknown,
    options: EventPublishOptions,
    context: EventOperationContext,
  ) => MaybePromise<EventProviderResult>;
}

/** Trace bridge metadata for a producer operation.
 * @example const name = options.name
 */
export interface EventInvocationBridgeOptions {
  readonly name?: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
  readonly signal?: AbortSignal;
  readonly kind?: "producer";
  readonly input?: unknown;
}

/** Optional invocation bridge that owns a publication span.
 * @example await bridge.run(() => provider.publish(payload, {}, context))
 */
export interface EventInvocationBridge {
  /** Runs publication within the invocation context.
   * @param operation - Publication callback.
   * @param options - Producer span metadata.
   * @returns The operation result or rejection.
   * @example await bridge.run(() => Promise.resolve(1))
   */
  readonly run: <A>(
    operation: () => MaybePromise<A>,
    options?: EventInvocationBridgeOptions,
  ) => Promise<A>;
}

/** Dependencies and policy for a generated event publisher.
 * Provider selection occurs once when the client is created.
 * @example const options: EventClientOptions = { ownerId: "orders.create", eventId: "orders.created", version: 1, source: provider }
 */
export interface EventClientOptions<
  Id extends string = string,
  Version extends number = number,
  PayloadSchema extends StandardSchemaV1 = StandardSchemaV1,
> {
  readonly ownerId: string;
  readonly eventId: Id;
  readonly version: Version;
  readonly source: unknown;
  readonly payloadSchema?: PayloadSchema;
  readonly profile?: string;
  readonly resolveProfile?: (profile: string) => unknown;
  readonly bridge?: EventInvocationBridge;
  readonly signal?: () => AbortSignal;
  readonly deadline?: () => number | undefined;
  readonly correlationId?: string | (() => string | undefined);
  readonly now?: () => Date;
  readonly declared?: boolean;
  readonly onDeclaredEdge?: (edge: EventDeclaredEdge) => void;
  readonly onObservedEdge?: (edge: EventObservedEdge) => void;
}

/** Promise compatibility interface exposed to application handlers.
 * @example await client.publish({ orderId: "one" })
 */
export interface EventClient<
  Input = unknown,
  Id extends string = string,
  Version extends number = number,
  Payload = Input,
> {
  /** Publishes a payload and returns the accepted envelope.
   * @param payload - Event payload to decode.
   * @param options - Optional key and attributes.
   * @returns A Promise of the accepted envelope or a rejected domain error.
   * @example await client.publish(payload, { key: "order-1" })
   */
  readonly publish: (
    payload: Input,
    options?: EventPublishOptions,
  ) => Promise<EventPublishResult<Id, Version, Payload>>;
}

/** Static graph edge for a declared publication dependency.
 * @example const edge: EventDeclaredEdge = { kind: "publishes-event", from: "orders.create", to: "orders.created" }
 */
export interface EventDeclaredEdge {
  readonly kind: "publishes-event";
  readonly from: string;
  readonly to: string;
}

/** Runtime graph edge for an attempted publication.
 * @example const edge: EventObservedEdge = { relationship: "publishes-event", from: "orders.create", to: "orders.created" }
 */
export interface EventObservedEdge {
  readonly relationship: "publishes-event";
  readonly from: string;
  readonly to: string;
}

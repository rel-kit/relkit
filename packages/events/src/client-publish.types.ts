import type { EventPublishOptions } from "@relkit/functions";
import type { StandardSchemaV1 } from "@relkit/schema";
export type { EventPublishOptions, EventPublishResult } from "@relkit/functions";
export type { InferInput, InferOutput, StandardSchemaV1 } from "@relkit/schema";
export type { EventProvider } from "./client.types.js";
import type { Effect } from "effect";
import type {
  EventClientOptions,
  EventOperationContext,
  EventProviderResult,
} from "./client.types.js";
import type { EventWorkFailed } from "./client-operation.js";
import type {
  EventClientValidationError,
  EventDependencyError,
  EventOperationCancelledError,
  EventOperationTimeoutError,
  EventPayloadValidationFailure,
} from "./client-errors.js";

/** Typed failures of an Effect event publication.
 * @example Effect.catchTag(publishEventEffect(setup, payload), "EventPayloadValidationFailure", handle)
 */
export type EventPublishFailure =
  | EventClientValidationError
  | EventDependencyError
  | EventOperationCancelledError
  | EventOperationTimeoutError
  | EventPayloadValidationFailure
  | EventWorkFailed;

/** Provider operation supplied to an Effect publication.
 * @example const publisher: EventPublisherService = { publish: () => Effect.succeed(reply) }
 */
export interface EventPublisherService {
  /** Publishes a validated payload.
   * @param payload - Decoded payload.
   * @param options - Validated request options.
   * @param context - Cancellation and trace context.
   * @returns Provider metadata or EventWorkFailed.
   * @example yield* publisher.publish(payload, {}, context)
   */
  readonly publish: (
    payload: unknown,
    options: EventPublishOptions,
    context: EventOperationContext,
  ) => Effect.Effect<EventProviderResult, EventWorkFailed>;
}

/** Validated state captured by a generated event client.
 * @example const setup: EventPublishSetup<"orders.created", 1, typeof schema> = validated
 */
export interface EventPublishSetup<
  Id extends string,
  Version extends number,
  PayloadSchema extends StandardSchemaV1,
> {
  readonly options: EventClientOptions<Id, Version, PayloadSchema>;
  readonly ownerId: string;
  readonly eventId: Id;
  readonly version: Version;
  readonly profile: string;
  readonly declared: boolean;
}

import { normalizeId } from "@relkit/contracts";
import { Effect } from "effect";
import {
  EventClientValidationError,
  EventDependencyError,
  EventPayloadValidationError,
  EventPayloadValidationFailure,
  EventProfileError,
  EventProviderError,
} from "./client-errors.js";
import { EventWorkFailed } from "./client-operation.js";
import { eventPublisherLayer, publishEventEffect } from "./client-publish.js";
import type { EventPublishSetup } from "./client-publish.types.js";
import { notifyEffect, resolveProviderEffect } from "./client-provider.js";
import { assertVersionEffect } from "./client-validation.js";
import { observeEvent, runEventSync } from "./event-observability.js";
import type {
  EventClient,
  EventClientOptions,
  EventProvider,
  EventPublishOptions,
  InferInput,
  InferOutput,
  StandardSchemaV1,
} from "./client.types.js";
export type {
  EventClient,
  EventClientOptions,
  EventDeclaredEdge,
  EventInvocationBridge,
  EventInvocationBridgeOptions,
  EventObservedEdge,
  EventOperationContext,
  EventProvider,
  EventProviderResult,
} from "./client.types.js";
export type {
  EventAttributeValue,
  EventPublishOptions,
  EventPublishResult,
} from "@relkit/functions";
export {
  EventDependencyError,
  EventOperationCancelledError,
  EventOperationTimeoutError,
  EventPayloadValidationError,
  EventProfileError,
  EventProviderError,
} from "./client-errors.js";

/** Creates a Promise publisher from a validated event contract.
 * @param options - Client dependencies and publication policy.
 * @returns A frozen client exposing a Promise publish operation.
 * @throws TypeError for malformed client configuration, or a provider profile error.
 * @example createEventClient({ ownerId: "orders.create", eventId: "orders.created", version: 1, source: provider })
 */
export function createEventClient<
  const Id extends string,
  const Version extends number,
  const PayloadSchema extends StandardSchemaV1 = StandardSchemaV1,
>(
  options: EventClientOptions<Id, Version, PayloadSchema>,
): EventClient<InferInput<PayloadSchema>, Id, Version, InferOutput<PayloadSchema>> {
  try {
    return runEventSync(createEventClientEffect(options));
  } catch (error) {
    if (error instanceof EventClientValidationError && Object.hasOwn(error, "cause"))
      throw error.cause;
    if (error instanceof EventClientValidationError) throw new TypeError(error.message);
    throw error;
  }
}

/** Creates an Effect-backed event publisher with typed configuration failures.
 * @param options - Client dependencies and publication policy.
 * @returns An Effect succeeding with a frozen Promise client or failing with a tagged configuration error.
 * @example Effect.runSync(createEventClientEffect({ ownerId: "orders.create", eventId: "orders.created", version: 1, source: provider }))
 */
export function createEventClientEffect<
  const Id extends string,
  const Version extends number,
  const PayloadSchema extends StandardSchemaV1 = StandardSchemaV1,
>(
  options: EventClientOptions<Id, Version, PayloadSchema>,
): Effect.Effect<
  EventClient<InferInput<PayloadSchema>, Id, Version, InferOutput<PayloadSchema>>,
  EventClientValidationError | EventProfileError | EventProviderError
> {
  return observeEvent(
    "client.create",
    Effect.fn("Events.createClient")(function* () {
      const ownerId = yield* stableId(options.ownerId);
      const eventId = (yield* stableId(options.eventId)) as Id;
      const version = (yield* assertVersionEffect(options.version)) as Version;
      const profile = yield* stableId(options.profile ?? "default");
      const declared = options.declared !== false;
      const provider = declared
        ? yield* resolveProviderEffect(options.source, profile, options.resolveProfile)
        : undefined;
      yield* notifyEffect(
        options.onDeclaredEdge,
        { kind: "publishes-event", from: ownerId, to: eventId } as const,
        declared,
      );
      const setup: EventPublishSetup<Id, Version, PayloadSchema> = {
        options,
        ownerId,
        eventId,
        version,
        profile,
        declared,
      };
      const layer = eventPublisherLayer(provider ?? undeclaredProvider(eventId));
      const publish = (payload: InferInput<PayloadSchema>, request?: EventPublishOptions) =>
        Effect.runPromise(
          publishEventEffect(setup, payload, request).pipe(Effect.provide(layer)),
        ).catch((error: unknown) => {
          if (error instanceof EventClientValidationError && Object.hasOwn(error, "cause"))
            throw error.cause;
          if (error instanceof EventClientValidationError) throw new TypeError(error.message);
          if (error instanceof EventPayloadValidationFailure)
            throw new EventPayloadValidationError(error.issues);
          if (error instanceof EventWorkFailed) throw error.cause;
          throw error;
        });
      return Object.freeze({ publish });
    })(),
  );
}

function stableId(value: unknown): Effect.Effect<string, EventClientValidationError> {
  return Effect.try({
    try: () => normalizeId(value),
    catch: (cause) =>
      new EventClientValidationError({
        message: cause instanceof Error ? cause.message : "Invalid event ID",
      }),
  });
}

function undeclaredProvider(eventId: string): EventProvider {
  return { publish: () => Promise.reject(new EventDependencyError(eventId)) };
}

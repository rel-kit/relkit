import { currentTracePropagation, frameworkTrace } from "@relkit/invocation";
import { Context, Effect, Layer } from "effect";
import {
  EventClientValidationError,
  EventDependencyError,
  EventOperationCancelledError,
} from "./client-errors.js";
import { EventWorkFailed, runAbortableEffect } from "./client-operation.js";
import type {
  EventProvider,
  EventPublishOptions,
  EventPublishResult,
  EventPublishFailure,
  EventPublishSetup,
  EventPublisherService,
  InferInput,
  InferOutput,
  StandardSchemaV1,
} from "./client-publish.types.js";
import { notifyEffect, resolveValueEffect } from "./client-provider.js";
import { normalizeResultEffect } from "./client-result.js";
import {
  assertOptionalTextEffect,
  normalizeOptionsEffect,
  parsePayloadEffect,
} from "./client-validation.js";
import { observeEvent } from "./event-observability.js";

/** Substitutable provider boundary for Effect event publication.
 * @example Effect.provide(publishEventEffect(setup, payload), eventPublisherLayer(provider))
 */
export class EventPublisher extends Context.Service<EventPublisher, EventPublisherService>()(
  "relkit/events/EventPublisher",
) {}

/** Adapts a Promise provider into a typed Effect service layer.
 * @param provider - Selected event provider.
 * @returns A live provider layer with tagged failures.
 * @example eventPublisherLayer(provider)
 */
export function eventPublisherLayer(provider: EventProvider): Layer.Layer<EventPublisher> {
  return Layer.succeed(
    EventPublisher,
    EventPublisher.of({
      publish: Effect.fn("Events.providerPublish")((payload, options, context) =>
        Effect.tryPromise({
          try: () => Promise.resolve().then(() => provider.publish(payload, options, context)),
          catch: (cause) => new EventWorkFailed({ cause }),
        }),
      ),
    }),
  );
}

/** Publishes one event through a supplied provider service.
 * @param setup - Validated client configuration.
 * @param payload - Event payload.
 * @param request - Publication options.
 * @returns An Effect succeeding with the accepted envelope or failing with a tagged publication error.
 * @example Effect.runPromise(publishEventEffect(setup, payload).pipe(Effect.provide(eventPublisherLayer(provider))))
 */
export function publishEventEffect<
  Id extends string,
  Version extends number,
  PayloadSchema extends StandardSchemaV1,
>(
  setup: EventPublishSetup<Id, Version, PayloadSchema>,
  payload: InferInput<PayloadSchema>,
  request: EventPublishOptions = {},
): Effect.Effect<
  EventPublishResult<Id, Version, InferOutput<PayloadSchema>>,
  EventPublishFailure,
  EventPublisher
> {
  return observeEvent(
    "client.publish",
    Effect.fn("Events.publish")(function* () {
      const { options, ownerId, eventId, version, profile, declared } = setup;
      const publishOptions = yield* normalizeOptionsEffect(request);
      const signal = yield* Effect.try({
        try: () => options.signal?.() ?? new AbortController().signal,
        catch: (cause) => clientError(cause),
      });
      const deadlineMs = yield* Effect.try({
        try: () => options.deadline?.(),
        catch: (cause) => clientError(cause),
      });
      const correlationId = yield* resolveValueEffect(options.correlationId);
      yield* assertOptionalTextEffect(correlationId, "correlationId");
      yield* notifyEffect(
        options.onObservedEdge,
        { relationship: "publishes-event", from: ownerId, to: eventId } as const,
        declared,
      );
      const publisher = yield* EventPublisher;
      const ambient = yield* Effect.context();
      const execute = (operationSignal: AbortSignal) =>
        Effect.gen(function* () {
          if (!declared) return yield* new EventDependencyError(eventId);
          if (operationSignal.aborted) return yield* new EventOperationCancelledError();
          const value = yield* parsePayloadEffect(options.payloadSchema, payload);
          const propagation = currentTracePropagation();
          const context = Object.freeze({
            operation: "publish" as const,
            eventId,
            version,
            signal: operationSignal,
            profile,
            ...(deadlineMs === undefined ? {} : { deadlineMs }),
            ...(propagation === undefined ? {} : { propagation }),
          });
          const result = yield* publisher.publish(value, publishOptions, context);
          return yield* normalizeResultEffect(
            result,
            value as InferOutput<PayloadSchema>,
            publishOptions,
            context,
            options.now,
            eventId,
            version,
          );
        });
      const name = `relkit.event.${eventId}.publish`;
      const attributes = {
        "relkit.event.id": eventId,
        "relkit.event.version": version,
        "relkit.event.profile": profile,
      };
      return yield* Effect.acquireUseRelease(
        Effect.sync(() => new AbortController()),
        (controller) =>
          runAbortableEffect(signal, deadlineMs, (effectSignal) => {
            const work = () =>
              effectSignal.aborted || controller.signal.aborted
                ? Promise.reject(new EventOperationCancelledError())
                : Effect.runPromise(Effect.provide(execute(controller.signal), ambient), {
                    signal: effectSignal,
                  });
            return (
              options.bridge?.run(work, {
                name,
                attributes,
                input: payload,
                signal,
                kind: "producer",
              }) ??
              frameworkTrace.span(name, { input: payload, kind: "producer", attributes }, work)
            );
          }),
        (controller) => Effect.sync(() => controller.abort()),
      );
    })(),
  );
}

function clientError(cause: unknown): EventClientValidationError {
  return new EventClientValidationError({
    message: cause instanceof Error ? cause.message : "Event client callback failed",
    cause,
  });
}

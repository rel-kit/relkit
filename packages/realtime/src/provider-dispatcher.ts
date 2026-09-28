import { REALTIME_RUNTIME_LIMITS } from "@relkit/contracts";
import { Clock, Context, Effect, Layer, Result } from "effect";
import type { RealtimeDispatcher } from "./dispatch.types.js";
import { OperationIdError, parseOperationIdEffect } from "./operation-id.js";
import type {
  ProviderRealtimeDispatcherOptions,
  RealtimeProviderSourceService,
} from "./provider-dispatcher.types.js";
import { digestEffect, encodedBytesEffect, providerScopeEffect } from "./provider-encoding.js";
import { limitsForEffect } from "./provider-limits.js";
import { OperationIdFailure, RealtimeProviderError } from "./realtime-errors.js";
import { observeRealtime } from "./realtime-observability.js";
export type * from "./provider-dispatcher.types.js";
export { limitsForEffect } from "./provider-limits.js";
/** Injectable profile-to-provider lookup.
 * @example Effect.provide(triggerProviderEffect(options, request), providerSourceLayer(options));
 */
export class RealtimeProviderSource extends Context.Service<
  RealtimeProviderSource,
  RealtimeProviderSourceService
>()("relkit/realtime/RealtimeProviderSource") {}
/** Builds a provider resolver layer from authored dispatcher options.
 * @param options - Dispatcher options containing the provider callback.
 * @returns A composable provider source Layer.
 * @example providerSourceLayer(options);
 */
export function providerSourceLayer(options: ProviderRealtimeDispatcherOptions) {
  return Layer.effect(
    RealtimeProviderSource,
    Effect.gen(function* () {
      return RealtimeProviderSource.of({
        resolve: Effect.fn("Realtime.resolveProvider")(
          function* (profile: string) {
            return yield* Effect.tryPromise({
              try: (signal) => Promise.resolve(options.provider(profile, signal)),
              catch: (cause) => new RealtimeProviderError({ operation: "provider.resolve", cause }),
            });
          },
          (effect) => observeRealtime("provider.resolve", effect),
        ),
      });
    }),
  );
}

/** Converts tagged Effect failures back to the established Promise rejection shape. */
async function runProviderPromise<A, E>(
  effect: Effect.Effect<A, E>,
  signal?: AbortSignal,
): Promise<A> {
  const result = await Effect.runPromise(Effect.result(effect), { signal });
  if (Result.isFailure(result)) {
    const error = result.failure;
    if (error instanceof OperationIdFailure) throw new OperationIdError(error.code, error.reason);
    if (error instanceof RealtimeProviderError) throw error.cause;
    throw error;
  }
  return result.success;
}
/** Sends a validated trigger to a resolved provider.
 * @param options - Dispatcher generation options.
 * @param request - Validated trigger request.
 * @returns An Effect of the receipt or OperationIdFailure or RealtimeProviderError; requires RealtimeProviderSource.
 * @example Effect.runPromise(Effect.provide(triggerProviderEffect(options, request), providerSourceLayer(options)));
 */
export const triggerProviderEffect = Effect.fn("Realtime.triggerProvider")(
  function* (
    options: ProviderRealtimeDispatcherOptions,
    request: Parameters<RealtimeDispatcher["trigger"]>[0],
  ) {
    const { channel, params, event, payload, options: triggerOptions } = request;
    const now = yield* Clock.currentTimeMillis;
    const operationId = triggerOptions?.idempotencyKey;
    if (operationId !== undefined)
      yield* parseOperationIdEffect(operationId, {
        now,
        receiptWindowMs: REALTIME_RUNTIME_LIMITS.triggerReceiptMs,
      });
    const initial = yield* providerScopeEffect(
      options,
      channel.id,
      channel.profile ?? "default",
      params,
    );
    const source = yield* RealtimeProviderSource;
    const provider = yield* source.resolve(initial.profile);
    const providerEpoch = yield* Effect.tryPromise({
      try: (signal) => provider.getEpoch(signal),
      catch: (cause) => new RealtimeProviderError({ operation: "provider.getEpoch", cause }),
    });
    const scope = { ...initial, providerEpoch };
    const occurredAt = new Date(now).toISOString();
    const semanticDigest = yield* digestEffect({ scope, event, payload });
    const encodedBytes = yield* encodedBytesEffect({ event, payload, occurredAt });
    const limits = yield* limitsForEffect(options);
    return yield* Effect.tryPromise({
      try: (signal) =>
        provider.append(
          {
            ...scope,
            ...(operationId === undefined
              ? {}
              : {
                  operationId,
                  semanticDigest,
                  receiptExpiresAt: new Date(
                    now + REALTIME_RUNTIME_LIMITS.triggerReceiptMs,
                  ).toISOString(),
                }),
            event,
            payload,
            encodedBytes,
            occurredAt,
            ...(channel.replay === undefined ? {} : channel.replay),
            limits,
          },
          signal,
        ),
      catch: (cause) => new RealtimeProviderError({ operation: "provider.append", cause }),
    });
  },
  (effect) => observeRealtime("provider.trigger", effect),
);
/** Reads presence from a resolved provider.
 * @param options - Dispatcher generation options.
 * @param request - Validated presence request.
 * @returns An Effect of presence or RealtimeProviderError; requires RealtimeProviderSource.
 * @example Effect.runPromise(Effect.provide(readProviderPresenceEffect(options, request), providerSourceLayer(options)));
 */
export const readProviderPresenceEffect = Effect.fn("Realtime.readProviderPresence")(
  function* (
    options: ProviderRealtimeDispatcherOptions,
    request: Parameters<RealtimeDispatcher["getPresence"]>[0],
  ) {
    const { channel, params } = request;
    const initial = yield* providerScopeEffect(
      options,
      channel.id,
      channel.profile ?? "default",
      params,
    );
    const source = yield* RealtimeProviderSource;
    const provider = yield* source.resolve(initial.profile);
    const providerEpoch = yield* Effect.tryPromise({
      try: (signal) => provider.getEpoch(signal),
      catch: (cause) => new RealtimeProviderError({ operation: "provider.getEpoch", cause }),
    });
    const limits = yield* limitsForEffect(options);
    return yield* Effect.tryPromise({
      try: (signal) =>
        provider.readPresence(
          {
            ...initial,
            providerEpoch,
            maxMembers:
              typeof channel.presence === "object"
                ? channel.presence.maxMembers
                : limits.maxPresenceMembers,
          },
          signal,
        ),
      catch: (cause) => new RealtimeProviderError({ operation: "provider.readPresence", cause }),
    });
  },
  (effect) => observeRealtime("provider.getPresence", effect),
);
/** Creates the compatibility dispatcher through the Effect path.
 * @param options - Provider lookup and generation identity.
 * @returns An Effect of a dispatcher without a typed failure.
 * @example Effect.runSync(createProviderRealtimeDispatcherEffect(options));
 */
export const createProviderRealtimeDispatcherEffect = Effect.fn(
  "Realtime.createProviderDispatcher",
)(
  function* (options: ProviderRealtimeDispatcherOptions): Generator<never, RealtimeDispatcher> {
    const source = providerSourceLayer(options);
    return {
      trigger: (request, signal) =>
        runProviderPromise(Effect.provide(triggerProviderEffect(options, request), source), signal),
      getPresence: (request, signal) =>
        runProviderPromise(
          Effect.provide(readProviderPresenceEffect(options, request), source),
          signal,
        ),
    };
  },
  (effect) => observeRealtime("provider.createDispatcher", effect),
);
/** Creates a provider-backed realtime dispatcher.
 * @param options - Provider lookup, identity, and optional runtime limits.
 * @returns A dispatcher with Promise-based trigger and presence methods.
 * @throws An Effect runtime defect if construction cannot execute synchronously.
 * @example const dispatcher = createProviderRealtimeDispatcher(options);
 */
export function createProviderRealtimeDispatcher(
  options: ProviderRealtimeDispatcherOptions,
): RealtimeDispatcher {
  return Effect.runSync(createProviderRealtimeDispatcherEffect(options));
}

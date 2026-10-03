import { REALTIME_RUNTIME_LIMITS } from "@relkit/contracts";
import { Clock, Context, Effect, Layer, Option, Stream } from "effect";
import { createHash } from "node:crypto";
import { httpBoundary, httpIterable, observeHttp, runHttp } from "./http-effect.js";
import { observeHttpStream } from "./http-stream-observation.js";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import type { RealtimeFrame } from "./realtime-observation.types.js";
import { presence } from "./realtime-presence.js";
import {
  channelContext,
  validatePublicValue,
  type SubscribeInput,
} from "./realtime-rpc-support.js";
import { assertExpectedIdentity } from "./rpc-identity.js";
import type { RpcContext } from "./rpc.js";

/** Opens a channel with scoped presence and per-observation authorization.
 * @param input - Submitted operation input; validation and authorization occur before effects are admitted.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param options - Application dependencies and configuration for this domain.
 * @param signal - Cancellation signal inherited from the caller or owning scope.
 * @returns A lazy stream owning presence leases and rechecking access before each emitted frame.
 */
function observe(
  input: SubscribeInput,
  context: RpcContext,
  options: RouteMaterializationOptions,
  signal?: AbortSignal,
) {
  return Stream.unwrap(
    Effect.gen(function* () {
      /** Revalidate session identity and channel access at the requested replay position.
       * @param after - Optional checkpoint whose partition must match the current grant.
       * @returns The freshly authorized channel descriptor, provider and trusted scope.
       */
      const authorize = Effect.fn("RealtimeSubscriptions.authorize")(function* (
        after?: SubscribeInput["after"],
      ) {
        yield* httpBoundary("realtime.identity", () =>
          assertExpectedIdentity(context, options.clientIdentity!, input.expectedIdentity),
        );
        return yield* httpBoundary("realtime.authorize", () =>
          channelContext(
            after === undefined
              ? { channel: input.channel, params: input.params }
              : { ...input, after },
            context,
            options,
          ),
        );
      });
      const owner = yield* authorize(input.after);
      let after = owner.descriptor.replay === undefined ? undefined : input.after;
      const initial: RealtimeFrame[] = [];
      if (input.after !== undefined && owner.descriptor.replay === undefined) {
        const fence = yield* httpBoundary("realtime.fence", () =>
          owner.provider.readAfter({ ...owner.scope, limit: 1, maxEncodedBytes: 64 * 1024 }),
        );
        initial.push({ kind: "gap", reason: "replay-disabled", checkpoint: fence.checkpoint });
        after = fence.checkpoint;
      }
      const leaseId = crypto.randomUUID();
      const lease = {
        ...owner.scope,
        leaseId,
        connectionId: leaseId,
        maxMembers:
          typeof owner.descriptor.presence === "object"
            ? owner.descriptor.presence.maxMembers
            : 1_000,
        maxConnections: REALTIME_RUNTIME_LIMITS.liveConnections,
      };
      let renewedAt = yield* Clock.currentTimeMillis;
      if (owner.descriptor.presence !== undefined) {
        const presence = owner.descriptor.presence;
        const member =
          typeof presence === "object"
            ? yield* httpBoundary("realtime.presence.member", async () =>
                validatePublicValue(
                  presence.member,
                  await presence.resolve(owner.params, owner.trusted),
                ),
              )
            : undefined;
        const snapshot = yield* Effect.acquireRelease(
          observeHttp(
            "realtime.presence.acquire",
            httpBoundary("realtime.presence.acquire", () =>
              owner.provider.acquirePresence({
                ...lease,
                expiresAt: new Date(renewedAt + 45_000).toISOString(),
                ...(member === undefined
                  ? {}
                  : {
                      opaqueMemberId: createHash("sha256")
                        .update(
                          `${owner.scope.channelId}:${owner.scope.partition}:${owner.scope.identityScope}`,
                        )
                        .digest("hex"),
                      memberInfo: member,
                    }),
              }),
            ),
          ),
          () =>
            observeHttp(
              "realtime.presence.release",
              httpBoundary("realtime.presence.release", () =>
                owner.provider.releasePresence(lease),
              ),
            ).pipe(
              Effect.catch(() =>
                Effect.logWarning("Presence release failed; the bounded lease will expire"),
              ),
            ),
        );
        initial.push({ kind: "presence", presence: snapshot });
      }
      const pages = Stream.paginate(
        { after, wait: false },
        Effect.fn("RealtimeSubscriptions.readPage")(function* (state) {
          if (signal?.aborted) return [[], Option.none<typeof state>()] as const;
          const resolved = yield* authorize(state.after);
          if (state.wait && state.after !== undefined) {
            const checkpoint = state.after;
            const now = yield* Clock.currentTimeMillis;
            yield* httpBoundary("realtime.wait", (fiberSignal) =>
              resolved.provider.waitAfter({
                ...resolved.scope,
                after: checkpoint,
                deadlineMs: now + 15_000,
                signal: signal === undefined ? fiberSignal : AbortSignal.any([signal, fiberSignal]),
              }),
            );
          }
          const page = yield* observeHttp(
            "realtime.read",
            httpBoundary("realtime.read", () =>
              resolved.provider.readAfter({
                ...resolved.scope,
                ...(state.after === undefined ? {} : { after: state.after }),
                limit: 100,
                maxEncodedBytes: 1024 * 1024,
              }),
            ),
          );
          const frames: RealtimeFrame[] = [];
          if (page.gap !== undefined)
            frames.push({ kind: "gap", reason: page.gap, checkpoint: page.checkpoint });
          for (const record of page.events) {
            const current = yield* authorize(record.checkpoint);
            const schema = current.descriptor.events[record.event];
            if (schema === undefined) continue;
            const payload = yield* httpBoundary("realtime.validate", () =>
              validatePublicValue(schema, record.payload),
            );
            frames.push({
              kind: "event",
              event: record.event,
              payload,
              checkpoint: record.checkpoint,
            });
          }
          const now = yield* Clock.currentTimeMillis;
          if (resolved.descriptor.presence !== undefined && now - renewedAt >= 15_000) {
            const snapshot = yield* observeHttp(
              "realtime.presence.renew",
              httpBoundary("realtime.presence.renew", () =>
                resolved.provider.renewPresence({
                  ...lease,
                  ...resolved.scope,
                  expiresAt: new Date(now + 45_000).toISOString(),
                }),
              ),
            );
            frames.push({ kind: "presence", presence: snapshot });
            renewedAt = now;
          }
          if (!page.hasMore) frames.push({ kind: "caught-up", checkpoint: page.checkpoint });
          return [frames, Option.some({ after: page.checkpoint, wait: !page.hasMore })] as const;
        }),
      );
      // Reauthorize on pull as well as page read: buffered events cannot outlive a grant.
      return Stream.fromIterable(initial).pipe(
        Stream.concat(pages),
        Stream.mapEffect((frame) =>
          authorize("checkpoint" in frame ? frame.checkpoint : undefined).pipe(Effect.as(frame)),
        ),
      );
    }),
  );
}

/** Channel observations own lease cleanup, backpressure and fresh identity checks. */
export class RealtimeSubscriptions extends Context.Service<
  RealtimeSubscriptions,
  { readonly observe: typeof observe; readonly presence: typeof presence }
>()("@relkit/runtime-hono/RealtimeSubscriptions") {}

/** Live channel workflows with independently observed presence reads. */
export const RealtimeSubscriptionsLive = Layer.succeed(RealtimeSubscriptions, {
  observe: (...args) => observeHttpStream("realtime.observe", observe(...args)),
  presence: (...args) => observeHttp("realtime.presence.read", presence(...args)),
});

/** Native oRPC observation edge; returning the iterator releases its presence lease.
 * @param input - Submitted operation input; validation and authorization occur before effects are admitted.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param options - Application dependencies and configuration for this domain.
 * @param signal - Cancellation signal inherited from the caller or owning scope.
 * @returns A native iterator retaining presence ownership until return, failure or EOF.
 */
export function observeRealtime(
  input: SubscribeInput,
  context: RpcContext,
  options: RouteMaterializationOptions,
  signal?: AbortSignal,
): AsyncIterable<RealtimeFrame> {
  return httpIterable(
    Stream.unwrap(
      Effect.map(RealtimeSubscriptions, (service) =>
        service.observe(input, context, options, signal),
      ),
    ).pipe(Stream.provide(RealtimeSubscriptionsLive)),
  );
}

/** Native oRPC presence edge retaining the existing Promise and error contract.
 * @param input - Submitted operation input; validation and authorization occur before effects are admitted.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param options - Application dependencies and configuration for this domain.
 * @returns A Promise for the authorized presence snapshot or the existing public failure.
 */
export function readRealtimePresence(
  input: SubscribeInput,
  context: RpcContext,
  options: RouteMaterializationOptions,
) {
  return runHttp(
    Effect.flatMap(RealtimeSubscriptions, (service) =>
      service.presence(input, context, options),
    ).pipe(Effect.provide(RealtimeSubscriptionsLive)),
  );
}

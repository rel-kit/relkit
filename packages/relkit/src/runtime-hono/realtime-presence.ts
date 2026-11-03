import { Effect } from "effect";
import { httpBoundary, HttpBoundaryError } from "./http-effect.js";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import { channelContext, type SubscribeInput } from "./realtime-rpc-support.js";
import { assertExpectedIdentity } from "./rpc-identity.js";
import type { RpcContext } from "./rpc.js";

/** Reads presence without acquiring a connection lease.
 * @param input - Submitted operation input; validation and authorization occur before effects are admitted.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param options - Application dependencies and configuration for this domain.
 * @returns An effect yielding the current authorized presence snapshot without acquiring a lease.
 */
export const presence = Effect.fn("RealtimeSubscriptions.presence")(function* (
  input: SubscribeInput,
  context: RpcContext,
  options: RouteMaterializationOptions,
) {
  yield* httpBoundary("realtime.identity", () =>
    assertExpectedIdentity(context, options.clientIdentity!),
  );
  const resolved = yield* httpBoundary("realtime.authorize", () =>
    channelContext(input, context, options),
  );
  if (resolved.descriptor.presence === undefined)
    return yield* Effect.fail(
      new HttpBoundaryError({
        operation: "realtime.presence.read",
        cause: new Error("Presence is not enabled."),
      }),
    );
  const maxMembers =
    typeof resolved.descriptor.presence === "object"
      ? resolved.descriptor.presence.maxMembers
      : 1_000;
  return yield* httpBoundary("realtime.presence.read", () =>
    resolved.provider.readPresence({ ...resolved.scope, maxMembers }),
  );
});

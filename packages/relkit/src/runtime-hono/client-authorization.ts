import { ORPCError } from "@orpc/server";
import { Context, Effect, Layer, Schema } from "effect";
import { httpBoundary, observeHttp, runHttp } from "./http-effect.js";

/** Concealed authorization failure; transport adapters choose the public error. */
export class ClientAuthorizationDenied extends Schema.TaggedError<ClientAuthorizationDenied>()(
  "ClientAuthorizationDenied",
  { resource: Schema.Literals(["agent", "channel"]) },
) {}

/** Evaluates a fresh policy for every request or observation frame. */
export class ClientAuthorization extends Context.Service<
  ClientAuthorization,
  {
    readonly require: (
      authorize: () => boolean | PromiseLike<boolean>,
      resource: "agent" | "channel",
      timeoutMs: number,
    ) => Effect.Effect<void, ClientAuthorizationDenied>;
  }
>()("@relkit/runtime-hono/ClientAuthorization") {}

/** Uses Effect's clock and interruption to bound user authorization callbacks. */
export const ClientAuthorizationLive = Layer.succeed(ClientAuthorization, {
  require: Effect.fn("ClientAuthorization.require")(
    (
      authorize: () => boolean | PromiseLike<boolean>,
      resource: "agent" | "channel",
      timeoutMs: number,
    ) =>
      observeHttp(
        "authorization.require",
        httpBoundary("authorization.policy", () => Promise.resolve().then(authorize)).pipe(
          Effect.timeout(timeoutMs),
          Effect.catch(() => Effect.succeed(false)),
          Effect.flatMap((allowed) =>
            allowed === true
              ? Effect.void
              : Effect.fail(new ClientAuthorizationDenied({ resource })),
          ),
        ),
      ),
  ),
});

/** Bounds an application authorization callback and returns a safe denial on rejection.
 * @param authorize - authorize supplied by the caller.
 * @param resource - Resource kind used to produce a safe authorization denial.
 * @param timeoutMs - Maximum authorization or request duration in milliseconds.
 * @returns A Promise resolving when authorized, otherwise rejecting with the concealed NOT_FOUND error.
 */
export async function requireClientAuthorization(
  authorize: () => boolean | PromiseLike<boolean>,
  resource: "agent" | "channel",
  timeoutMs = 10_000,
): Promise<void> {
  try {
    await runHttp(
      Effect.gen(function* () {
        const authorization = yield* ClientAuthorization;
        yield* authorization.require(authorize, resource, timeoutMs);
      }).pipe(Effect.provide(ClientAuthorizationLive)),
    );
    return;
  } catch {}
  throw new ORPCError("NOT_FOUND", {
    message: `${resource === "agent" ? "Agent" : "Channel"} resource was not found.`,
  });
}

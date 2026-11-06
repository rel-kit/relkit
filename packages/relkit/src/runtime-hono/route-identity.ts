/** Keeps the typed client's identity precondition on REST mutations. */
import type { Context } from "hono";
import type { HttpTriggerRegistration } from "../graph/index.js";
import { expectedClientIdentity, resolveClientIdentity } from "./client-identity.js";
import type { RouteMaterializationOptions } from "./materialize-routes.types.js";
import { contextProblem } from "./problem-details.js";
import { routeOperation } from "./route-operation.js";

/**
 * Wraps a mutation route so a request that names the identity it expects
 * (`x-relkit-identity-scope` and `x-relkit-session-epoch`, which the typed client sends)
 * fails with 409 `IDENTITY_PRECONDITION_FAILED` when the session changed since. Requests
 * without those headers, such as curl or another language's client, are unaffected.
 * @param trigger - Route declaration.
 * @param options - Runtime options carrying the client identity runtime.
 * @param handler - The route handler.
 * @returns The handler, wrapped when the route is a mutation and identity is configured.
 * @example app.post("/orders", withClientIdentity(trigger, options, handler));
 */
export function withClientIdentity(
  trigger: HttpTriggerRegistration,
  options: RouteMaterializationOptions,
  handler: (context: Context) => Promise<Response>,
): (context: Context) => Promise<Response> {
  const runtime = options.clientIdentity;
  if (runtime === undefined || routeOperation(trigger) !== "mutation") return handler;
  return async (context) => {
    const request = context.req.raw;
    const expected = expectedClientIdentity(request);
    if (expected === undefined) return handler(context);
    const actual = await resolveClientIdentity(runtime, request, options.auth?.contextFor(request));
    if (
      expected.identityScope === actual.identityScope &&
      expected.sessionEpoch === actual.sessionEpoch
    )
      return handler(context);
    return contextProblem(context, {
      status: 409,
      code: "IDENTITY_PRECONDITION_FAILED",
      detail: "The client identity changed before this operation was submitted.",
    });
  };
}

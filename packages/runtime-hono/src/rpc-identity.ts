import { ORPCError } from "@orpc/server";
import { expectedClientIdentity, resolveClientIdentity } from "./client-identity.js";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import type { RpcIdentityContext } from "./rpc-identity.types.js";
import { assertStateChangingRequest, TransportSecurityError } from "./transport-security.js";
export type { RpcIdentityContext } from "./rpc-identity.types.js";

/** Maps transport-security failures to the existing safe oRPC forbidden error.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param options - Application dependencies and configuration for this domain.
 * @returns A Promise resolving after security validation, or rejecting with a safe FORBIDDEN error.
 */
export async function assertRpcSecurity(
  context: RpcIdentityContext,
  options: NonNullable<RouteMaterializationOptions["transportSecurity"]>,
): Promise<void> {
  try {
    await assertStateChangingRequest(context.hono.req.raw, options);
  } catch (error) {
    throw new ORPCError("FORBIDDEN", {
      message: "Request security validation failed.",
      data: { code: error instanceof TransportSecurityError ? error.code : "CSRF_DENIED" },
    });
  }
}

/** Checks that the client's expected identity still matches its current session.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param runtime - Configured runtime and provider dependencies.
 * @param supplied - Expected client identity explicitly supplied by the protocol request.
 * @returns A Promise resolving when identity scope and session epoch match, otherwise rejecting with IDENTITY_PRECONDITION_FAILED.
 */
export async function assertExpectedIdentity(
  context: RpcIdentityContext,
  runtime: NonNullable<RouteMaterializationOptions["clientIdentity"]>,
  supplied?: import("@relkit/contracts").ExpectedClientIdentity,
): Promise<void> {
  const expected = supplied ?? expectedClientIdentity(context.hono.req.raw, context.rpcHeaders);
  const actual = await resolveClientIdentity(runtime, context.hono.req.raw, context.auth);
  if (
    expected === undefined ||
    expected.identityScope !== actual.identityScope ||
    expected.sessionEpoch !== actual.sessionEpoch
  ) {
    throw new ORPCError("IDENTITY_PRECONDITION_FAILED", {
      message: "The client identity changed before this operation was submitted.",
    });
  }
}

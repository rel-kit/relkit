import { ORPCError } from "@orpc/server";
import type { Context } from "hono";
import { expectedClientIdentity, resolveClientIdentity } from "./client-identity.js";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import { assertStateChangingRequest, TransportSecurityError } from "./transport-security.js";

export interface RpcIdentityContext {
  readonly hono: Context;
  readonly auth:
    ReturnType<NonNullable<RouteMaterializationOptions["auth"]>["contextFor"]> | undefined;
}

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

export async function assertExpectedIdentity(
  context: RpcIdentityContext,
  runtime: NonNullable<RouteMaterializationOptions["clientIdentity"]>,
  supplied?: import("@relkit/contracts").ExpectedClientIdentity,
): Promise<void> {
  const expected = supplied ?? expectedClientIdentity(context.hono.req.raw);
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

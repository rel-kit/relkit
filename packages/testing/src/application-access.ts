/** Function access rules on in-process routes, decided as the served application decides them:
 * the request's session is the caller, roles and permissions come from the auth service's
 * resolver, a rule's roles and permissions are checked before input is read, and the built-in
 * `unauthenticated` and `access-denied` failures answer 401 and 403 without a declaration.
 */
import { isAccessFailureId, problemResponse, sessionPrincipalSource } from "relkit/contracts";
import { enforceAccessBeforeInput, type AccessPrincipalSource } from "relkit/engine";
import type { InvocationFailure } from "relkit/runtime-effect";
import type { HttpAuthRuntime } from "relkit/runtime-hono";
import { Effect } from "effect";

/**
 * Builds the caller of one request from the application's auth runtime.
 * @param auth - The application's auth runtime, when it declares an auth service.
 * @param request - The request whose session is the caller.
 * @returns A memoized principal source, or undefined without an auth service, so the engine
 *   falls back to the handler context's session as the served application does.
 * @example const principal = requestPrincipal(services.auth, request);
 */
export function requestPrincipal(
  auth: HttpAuthRuntime | undefined,
  request: Request,
): AccessPrincipalSource | undefined {
  if (auth === undefined) return undefined;
  const context = auth.contextFor(request);
  return sessionPrincipalSource(() => context.getSession(), auth.resolveAccess);
}

/**
 * Rejects a caller who fails a target's roles or permissions before the route reads input.
 * @param target - The route's function; its `access` rule is read when present.
 * @param principal - The request's caller; without one nothing is decided here.
 * @returns The 401 or 403 Problem Details response, or undefined when the route may continue.
 * @example const denied = await accessBeforeInput(route.target, principal);
 */
export async function accessBeforeInput(
  target: unknown,
  principal: AccessPrincipalSource | undefined,
): Promise<Response | undefined> {
  const rule = (target as { readonly access?: unknown }).access;
  if (principal === undefined || rule === null || typeof rule !== "object") return undefined;
  const failure = await Effect.runPromise(
    enforceAccessBeforeInput(rule as never, principal).pipe(
      Effect.as(undefined),
      Effect.catch((denied: InvocationFailure) => Effect.succeed(denied)),
    ),
  );
  return failure === undefined ? undefined : accessFailureResponse(failure);
}

/**
 * Answers a built-in access failure with its status, as the served application does.
 * @param failure - A normalized invocation failure.
 * @returns The Problem Details response, or undefined for any other failure.
 * @example const response = accessFailureResponse(normalizeFailure(error));
 */
export function accessFailureResponse(failure: InvocationFailure): Response | undefined {
  if (failure.kind !== "application" || !isAccessFailureId(failure.id)) return undefined;
  return problemResponse({
    status: failure.status ?? 403,
    code: failure.id,
    detail: failure.message,
  });
}

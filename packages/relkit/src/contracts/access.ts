/** Principals for function access rules and the built-in failure codes they produce. */
import type {
  AccessPrincipal,
  AccessResolver,
  AnonymousPrincipal,
  SystemPrincipal,
  UserPrincipal,
} from "./access.types.js";
export type * from "./access.types.js";

/** The application's own caller; it passes every access rule. */
export const SYSTEM_PRINCIPAL: SystemPrincipal = Object.freeze({ kind: "system" });

/** A caller without a session. */
export const ANONYMOUS_PRINCIPAL: AnonymousPrincipal = Object.freeze({ kind: "anonymous" });

/** Code of the failure raised when a signed-in caller does not pass an access rule (HTTP 403). */
export const ACCESS_DENIED_CODE = "access-denied";

/** Code of the failure raised when an access rule needs a session and there is none (HTTP 401). */
export const UNAUTHENTICATED_CODE = "unauthenticated";

/** HTTP status of each built-in access failure code. */
export const ACCESS_FAILURE_STATUS: Readonly<Record<string, number>> = Object.freeze({
  [ACCESS_DENIED_CODE]: 403,
  [UNAUTHENTICATED_CODE]: 401,
});

/** Whether an application failure ID is a built-in access failure that needs no declaration.
 * @param id - Failure ID.
 * @returns True for `access-denied` and `unauthenticated`.
 * @example isAccessFailureId("access-denied"); // true
 */
export function isAccessFailureId(id: string): boolean {
  return Object.hasOwn(ACCESS_FAILURE_STATUS, id);
}

/** Roles a session carries without an organization: Better Auth's admin plugin `user.role`.
 * @param session - Better Auth session, or any value.
 * @returns Roles split on commas; empty when none is set.
 * @example sessionRoles({ user: { role: "admin,support" } }); // ["admin", "support"]
 */
export function sessionRoles(session: unknown): readonly string[] {
  const user = isRecord(session) && isRecord(session.user) ? session.user : undefined;
  return splitRoles(user?.role);
}

/** Splits a Better Auth role value, which is a comma-separated string or a list.
 * @param role - Role value.
 * @returns Trimmed, non-empty roles.
 * @example splitRoles("owner, admin"); // ["owner", "admin"]
 */
export function splitRoles(role: unknown): readonly string[] {
  const values = Array.isArray(role) ? role : typeof role === "string" ? role.split(",") : [];
  return Object.freeze(
    values.flatMap((value) =>
      typeof value === "string" && value.trim() !== "" ? [value.trim()] : [],
    ),
  );
}

/** Builds the principal for a session, reading roles and permissions through a resolver.
 * @param session - Session, or null for an anonymous caller.
 * @param resolve - Optional resolver, such as the Better Auth organization reader.
 * @returns A user principal, or the anonymous principal without a session.
 * @example await principalFromSession(session);
 */
export async function principalFromSession(
  session: unknown,
  resolve?: AccessResolver,
): Promise<AccessPrincipal<unknown>> {
  if (session === null || session === undefined) return ANONYMOUS_PRINCIPAL;
  const access =
    resolve === undefined
      ? { roles: sessionRoles(session), hasPermission: () => false }
      : await resolve(session);
  return Object.freeze({
    kind: "user",
    session,
    roles: Object.freeze([...access.roles]),
    hasPermission: access.hasPermission,
  }) satisfies UserPrincipal<unknown>;
}

/** Resolves the caller of a request from its session lookup, once and only when a rule needs it.
 * @param getSession - Session lookup, such as the request's memoized Better Auth session.
 * @param resolve - Optional role and permission resolver.
 * @returns A principal source for the engine.
 * @example invoke({ ..., principal: sessionPrincipalSource(() => auth.getSession()) });
 */
export function sessionPrincipalSource(
  getSession: () => Promise<unknown>,
  resolve?: AccessResolver,
): () => Promise<AccessPrincipal<unknown>> {
  let pending: Promise<AccessPrincipal<unknown>> | undefined;
  return () => (pending ??= getSession().then((session) => principalFromSession(session, resolve)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

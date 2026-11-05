/** Function access rules: the engine checks them before every handler, whatever started the call. */
import {
  ACCESS_DENIED_CODE,
  ACCESS_FAILURE_STATUS,
  ANONYMOUS_PRINCIPAL,
  principalFromSession,
  SYSTEM_PRINCIPAL,
  UNAUTHENTICATED_CODE,
  type AccessPrincipal,
  type AccessPrincipalSource,
  type AccessRule,
} from "../contracts/index.js";
import { applicationFailure, type InvocationFailure } from "../invocation/index.js";
import { observeExecution } from "../runtime-effect/index.js";
import { Effect } from "effect";
import type { InvocationSource } from "./invoke-types.js";

export {
  ACCESS_DENIED_CODE,
  ANONYMOUS_PRINCIPAL,
  principalFromSession,
  sessionPrincipalSource,
  SYSTEM_PRINCIPAL,
  UNAUTHENTICATED_CODE,
} from "../contracts/index.js";
export type {
  AccessPrincipal,
  AccessPrincipalSource,
  AccessResolver,
  AccessRule,
} from "../contracts/index.js";

const systemSource: AccessPrincipalSource = () => Promise.resolve(SYSTEM_PRINCIPAL);

/** Shares one principal lookup among an invocation and its children.
 * @param source - Principal source to memoize.
 * @returns A source that resolves the principal at most once.
 * @example const once = memoizePrincipal(async () => ({ kind: "anonymous" }));
 */
export function memoizePrincipal(source: AccessPrincipalSource): AccessPrincipalSource {
  let pending: Promise<AccessPrincipal<unknown>> | undefined;
  return () => (pending ??= source());
}

/** Picks the caller of an invocation: explicit, inherited from the parent, or `system` for handle calls.
 * @param explicit - Principal the caller supplied.
 * @param inherited - Principal of the parent invocation.
 * @param source - Invocation source.
 * @returns The principal source, or undefined to fall back to the context session.
 * @example invocationPrincipal(undefined, undefined, "system");
 */
export function invocationPrincipal(
  explicit: AccessPrincipalSource | undefined,
  inherited: AccessPrincipalSource | undefined,
  source: InvocationSource,
): AccessPrincipalSource | undefined {
  return explicit ?? inherited ?? (source === "system" ? systemSource : undefined);
}

/** Checks a target's access rule before its handler runs.
 * @param rule - The target's rule; no rule allows every caller.
 * @param input - Validated input passed to the predicate.
 * @param context - Handler context whose `auth.getSession` is the fallback caller.
 * @param principal - The invocation's caller, when known.
 * @returns Nothing when allowed; fails with `unauthenticated` or `access-denied` otherwise.
 * @example yield* enforceAccess(target.access, input, context, options.principal);
 */
export const enforceAccess = Effect.fn("Engine.enforceAccess")(
  function* (
    rule: AccessRule<never, unknown> | undefined,
    input: unknown,
    context: unknown,
    principal: AccessPrincipalSource | undefined,
  ) {
    if (rule === undefined) return;
    const caller = yield* Effect.tryPromise({
      try: () => (principal ?? contextPrincipal(context))(),
      catch: (cause) => cause,
    }).pipe(Effect.orDie);
    if (caller.kind === "system") return;
    const allowed = yield* Effect.tryPromise({
      try: () => passes(rule as AccessRule<unknown, unknown>, caller, input),
      catch: (cause) => cause,
    }).pipe(Effect.orDie);
    if (allowed) return;
    return yield* Effect.fail(accessFailure(caller.kind === "user"));
  },
  (effect) => observeExecution("engine", "enforceAccess", effect),
);

/** Reads the caller from the handler context's session when no principal was supplied. */
function contextPrincipal(context: unknown): AccessPrincipalSource {
  const auth = (context as { readonly auth?: { readonly getSession?: () => Promise<unknown> } })
    .auth;
  return async () =>
    auth?.getSession === undefined
      ? ANONYMOUS_PRINCIPAL
      : principalFromSession(await auth.getSession());
}

async function passes(
  rule: AccessRule<unknown, unknown>,
  caller: Exclude<AccessPrincipal<unknown>, { readonly kind: "system" }>,
  input: unknown,
): Promise<boolean> {
  const user = caller.kind === "user" ? caller : undefined;
  if (rule.roles !== undefined && !rule.roles.some((role) => user?.roles.includes(role) === true))
    return false;
  for (const permission of rule.permissions ?? [])
    if (user === undefined || !(await user.hasPermission(permission))) return false;
  return rule.allow === undefined
    ? true
    : (await rule.allow({ principal: caller, session: user?.session ?? null, input })) === true;
}

function accessFailure(signedIn: boolean): InvocationFailure {
  const id = signedIn ? ACCESS_DENIED_CODE : UNAUTHENTICATED_CODE;
  return applicationFailure({
    id,
    message: signedIn
      ? "The caller is not allowed to call this function."
      : "This function requires a signed-in session.",
    data: null,
    status: ACCESS_FAILURE_STATUS[id]!,
  });
}

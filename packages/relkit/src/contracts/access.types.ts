declare global {
  namespace Relkit {
    /** Generated: the application's context types, including its Better Auth session. */
    interface ApplicationContextRegistry {}
  }
}

/** The application's session type, taken from its registered Better Auth context. */
export type AccessSession = Relkit.ApplicationContextRegistry extends {
  readonly auth: { readonly getSession: () => Promise<infer Session> };
}
  ? Exclude<Session, null>
  : unknown;

/** The application itself: runtime-handle calls, scripts and startup hooks.
 * @example const principal: SystemPrincipal = { kind: "system" };
 */
export interface SystemPrincipal {
  readonly kind: "system";
}

/** A caller without a session.
 * @example const principal: AnonymousPrincipal = { kind: "anonymous" };
 */
export interface AnonymousPrincipal {
  readonly kind: "anonymous";
}

/** A signed-in user, with the roles of the active organization when one is configured.
 * @example if (principal.kind === "user") principal.roles.includes("admin");
 */
export interface UserPrincipal<Session = AccessSession> {
  readonly kind: "user";
  readonly session: Session;
  /** Roles of the user, such as the member role in the active Better Auth organization. */
  readonly roles: readonly string[];
  /** Checks one `resource:action` permission, such as `orders:refund`. */
  readonly hasPermission: (permission: string) => boolean | Promise<boolean>;
}

/** The caller an access rule decides about.
 * @example const principal: AccessPrincipal = { kind: "system" };
 */
export type AccessPrincipal<Session = AccessSession> =
  SystemPrincipal | AnonymousPrincipal | UserPrincipal<Session>;

/** What an access predicate receives.
 * @example const allow = ({ session, input }: AccessRequest<{ ownerId: string }>) => session?.user.id === input.ownerId;
 */
export interface AccessRequest<Input = unknown, Session = AccessSession> {
  readonly principal: AnonymousPrincipal | UserPrincipal<Session>;
  /** The signed-in session, or null for an anonymous caller. */
  readonly session: Session | null;
  readonly input: Input;
}

/** Who may call a function. Every part that is set must pass; system calls skip the rule.
 * @example const access: AccessRule = { roles: ["admin"], permissions: ["orders:refund"] };
 */
export interface AccessRule<Input = unknown, Session = AccessSession> {
  /** The caller needs at least one of these roles. */
  readonly roles?: readonly string[];
  /** The caller needs every one of these `resource:action` permissions. */
  readonly permissions?: readonly string[];
  /** Custom decision over the session and validated input; return false to deny. */
  readonly allow?: (request: AccessRequest<Input, Session>) => boolean | Promise<boolean>;
}

/** Resolves the caller lazily, so calls without an access rule never read the session.
 * @example const source: AccessPrincipalSource = async () => ({ kind: "anonymous" });
 */
export type AccessPrincipalSource = () => Promise<AccessPrincipal<unknown>>;

/** Reads roles and permissions for a session, such as from the Better Auth organization plugin.
 * @example const resolve: AccessResolver = async () => ({ roles: ["admin"], hasPermission: () => true });
 */
export type AccessResolver = (
  session: unknown,
) => Promise<Pick<UserPrincipal<unknown>, "roles" | "hasPermission">>;

export {};

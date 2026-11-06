/** Reads function access roles and permissions from a Better Auth instance.
 * With the organization plugin, roles are the user's member role in the session's active
 * organization and permissions are checked against the plugin's access control. Without it,
 * roles come from the admin plugin's `user.role` and no permission is granted.
 */
import type { Auth } from "better-auth";
import { sessionRoles, splitRoles, type AccessResolver } from "relkit/contracts";

type Resolved = Awaited<ReturnType<AccessResolver>>;

interface OrganizationPlugin {
  readonly id: "organization";
  readonly options?: Record<string, unknown>;
}

interface SessionShape {
  readonly user?: { readonly id?: unknown };
  readonly session?: { readonly activeOrganizationId?: unknown };
}

/** Resolves the roles and permissions of a Better Auth session.
 * @param auth - The application's Better Auth instance.
 * @param session - A session returned by `auth.api.getSession`.
 * @returns Roles, and a `resource:action` permission check.
 * @example const { roles } = await resolveBetterAuthAccess(auth, session);
 */
export async function resolveBetterAuthAccess(
  auth: Auth<any>,
  session: unknown,
): Promise<Resolved> {
  const organization = organizationPlugin(auth);
  if (organization === undefined)
    return Object.freeze({ roles: sessionRoles(session), hasPermission: () => false });
  const shape = (session ?? {}) as SessionShape;
  const userId = shape.user?.id;
  const organizationId = shape.session?.activeOrganizationId;
  if (typeof userId !== "string" || typeof organizationId !== "string" || organizationId === "")
    return Object.freeze({ roles: Object.freeze([]), hasPermission: () => false });
  const context = await auth.$context;
  const member = await context.adapter.findOne<{ readonly role?: unknown }>({
    model: "member",
    where: [
      { field: "organizationId", value: organizationId },
      { field: "userId", value: userId },
    ],
  });
  const roles = splitRoles(member?.role);
  const { hasPermission } = await import("better-auth/plugins/organization");
  return Object.freeze({
    roles,
    hasPermission: async (permission: string) => {
      const [resource, action] = permission.split(":");
      if (roles.length === 0 || resource === undefined || action === undefined) return false;
      return hasPermission(
        {
          organizationId,
          role: roles.join(","),
          options: (organization.options ?? {}) as never,
          permissions: { [resource]: [action] },
        },
        { context } as never,
      );
    },
  });
}

function organizationPlugin(auth: Auth<any>): OrganizationPlugin | undefined {
  const plugins = (auth.options as { readonly plugins?: readonly unknown[] }).plugins ?? [];
  return plugins.find(
    (plugin): plugin is OrganizationPlugin =>
      plugin !== null &&
      typeof plugin === "object" &&
      (plugin as { readonly id?: unknown }).id === "organization",
  );
}

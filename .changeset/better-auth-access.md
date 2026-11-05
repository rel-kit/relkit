---
"@relkit/better-auth": minor
"@relkit/cli": minor
---

Function access rules read roles and permissions from Better Auth. With the organization plugin, a caller's roles are their member role in the session's active organization and `resource:action` permissions are checked against the plugin's access control, including dynamic roles; without it, roles come from the admin plugin's `user.role`. `resolveBetterAuthAccess(auth, session)` is exported from `@relkit/better-auth/drizzle`, and the generated server uses it for HTTP, MCP and `relkit.as(session)` calls.

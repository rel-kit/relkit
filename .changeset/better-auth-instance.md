---
"@relkit/better-auth": minor
"@relkit/cli": minor
"relkit": minor
---

New: `defineBetterAuthService({ auth })` takes the instance from your own Better Auth file (`export const auth = betterAuth({...})`). RelKit rebuilds it from `auth.options` when the server starts, adding your Drizzle database only when `database` is unset, and mounts its handler at `basePath` (`/api/auth` by default) unless you pass `mount: false`, so no auth route file is needed. The session type comes from the instance. Passing Better Auth options directly is deprecated.

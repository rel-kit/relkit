---
"relkit": minor
"@relkit/cli": minor
"@relkit/testing": minor
"@relkit/better-auth": minor
---

Breaking: Set `auth: "required"` on each route that needs a session; a signed-out request gets a 401 problem before the route's middleware and function run, and both read the same session lookup. The Better Auth route no longer accepts `auth: { protected: [...] }`. To limit the MCP endpoint to signed-in callers, set `server.mcp: { auth: "required" }`. See the [0.9 migration guide](https://relkit.dev/guides/migrate/relkit-0-9#route-auth).

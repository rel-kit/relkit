---
"relkit": minor
"@relkit/cli": minor
"@relkit/inspector": minor
---

Route authentication and function access rules are visible. Function graph nodes record `access` (roles, permissions and `predicate: true` for an `allow` check); OpenAPI operations of routes with `auth: "required"` or a protected function declare the `session` cookie security requirement, 401 and 403 problem responses and `x-relkit.auth` / `x-relkit.access`; and the Inspector's graph and route views show the access rule next to the route's auth requirement.

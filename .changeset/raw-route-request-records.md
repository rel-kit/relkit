---
"@relkit/runtime-hono": patch
---

Request records and traces for raw routes, such as a Better Auth handler or a `/health` route defined with only a `handler`, now carry the route's ID instead of `unknown`, so the Inspector can group and filter them like other routes.

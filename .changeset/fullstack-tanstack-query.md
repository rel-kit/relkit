---
"create-relkit": patch
---

Fixed: The `fullstack` template declares `@orpc/tanstack-query`, which the `@relkit/client` React provider imports, so `next build` succeeds in a new fullstack app.

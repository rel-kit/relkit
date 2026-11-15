---
"@relkit/cli": patch
---

`relkit dev` on Node serves the Inspector's actions: invoking a function, publishing or replaying an event and a `POST` from the route composer were refused with 403 `origin-denied`, because the inspection bridge forwarded them with Node's `fetch`, which drops the development listener's `Host`, so the application compared their `Origin` with its private worker port. They now go through the same Host-preserving client as other development traffic. Bun was not affected.

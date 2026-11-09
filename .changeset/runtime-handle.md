---
"relkit": minor
"@relkit/cli": minor
---

`getRelkit()` returns the running application's handle in code outside function handlers, such as raw routes, middleware and the new `server.onStart` callback in `defineApp`. The handle groups functions, events, tasks and jobs by service and member (`getRelkit().functions.orders.getOrder(input)`), keys caches, buckets, channels and agents by ID, and exposes the default database as `database`. It is read from asynchronous context, never from a process global; outside an application it throws `RELKIT_APPLICATION_NOT_RUNNING`. `server.onStart` runs once after providers are ready and before the server accepts requests.

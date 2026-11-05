---
"@relkit/cli": minor
"@relkit/cloudflare": minor
"@relkit/postgres": minor
"relkit": minor
---

Cloudflare durable services. The Workers entry gains `queue` and `scheduled` handlers that run due jobs, schedules and event deliveries from the Postgres backend, and every request that may submit work wakes the `RELKIT_WORK` queue. `@relkit/postgres` connects once per operation on Workers, where sockets cannot outlive a request. `@relkit/cloudflare` adds `durableObjectRealtime({ binding })` and the `RelkitRealtimeState` Durable Object (`@relkit/cloudflare/workers`), which the Workers build exports when the graph uses it. `relkit check` accepts the Postgres backend and Durable Object realtime on Workers.

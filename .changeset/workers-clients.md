---
"relkit": minor
"@relkit/cli": minor
"@relkit/redis": minor
"@relkit/cloudflare": minor
---

Workers-compatible clients. `@relkit/redis` accepts an `https://:<token>@host` URL and sends each command over HTTP (the Upstash REST protocol) for caches, which is the only Redis transport on Cloudflare Workers; realtime and agent state still need a `redis://` socket. `@relkit/cloudflare` adds `kvBinding({ binding })` and `r2Binding({ binding })`, a cache and a bucket on a Worker's own KV and R2 bindings, read through the new `workersBinding()` from `relkit/runtime/workers`. A Workers build loads integration modules statically, without the startup version check on disk.

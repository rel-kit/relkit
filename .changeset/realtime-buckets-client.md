---
"@relkit/client": patch
---

Iterating a subscription (`relkit.realtime.subscribe`, agent observation, job watch) now ends as soon as the caller's signal aborts, on Node as on Bun: a pending read rejects with the abort reason and the event stream is cancelled, which closes its HTTP request. On Node a garbage collection between the call and the abort could drop the abort on its way to `fetch`, leaving `for await` waiting on a stream that stayed open.

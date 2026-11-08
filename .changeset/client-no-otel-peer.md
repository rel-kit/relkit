---
"@relkit/client": patch
---

`@relkit/client` no longer declares `@opentelemetry/api` as a peer dependency. Nothing in the client imports it, so frontends that only call the generated client install one package instead of two; the installation guides reflect that.

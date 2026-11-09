---
"@relkit/client": patch
---

`@relkit/client` now carries `@opentelemetry/api` as a dependency instead of a required peer. The oRPC packages it is built on import that package's types in their declarations, so it must be present, but a frontend should not have to install a package it never calls; installing the client alone is enough under every package manager.

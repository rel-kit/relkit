---
"@relkit/cli": patch
---

A generated server now binds each bucket's declared `maxObjectBytes` and `allowedContentTypes` from the application graph to the bucket clients it builds, for function invocations, tasks and the application handle, so a disallowed type or size is refused before signing an upload URL or storing an object with any provider, including `@relkit/s3`.

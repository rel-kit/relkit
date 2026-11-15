---
"@relkit/testing": patch
---

The in-process HTTP client of `createTestApplication` decides function `access` rules as the served application does: the caller is the request's session with roles and permissions from the Better Auth organization plugin, a rule's roles and permissions are decided before input is validated, and the built-in failures answer `401 unauthenticated` and `403 access-denied` instead of `500`. `invokeFunction` and `runtime.invoke` accept an explicit `principal` for testing a protected function directly.

A bucket's declared `maxObjectBytes` and `allowedContentTypes` now hold for every bucket provider the test application wires, including a replacement provider, as they do in the generated server.

---
"@relkit/invocation": patch
"@relkit/runtime-hono": patch
---

Declared errors and validation failures no longer turn into `500 internal-error` when two copies of `@relkit/invocation` are loaded. This happened in `relkit dev` whenever Scalar, MCP or AG-UI was enabled, because the generated server bundles the framework while `@relkit/runtime-hono` loads its own copy from `node_modules`. A function's `fail(Unauthenticated)` therefore answered 500 instead of 401, and invalid query input answered 500 instead of 422. `RuntimeFailure`, `InvocationValidationError`, `RecursionPolicyError` and `DescriptorIdentityError` are now recognized across package copies, and the private failure cause store and descriptor identity registry are shared between copies. In development, a `500 internal-error` response now includes the redacted cause message, the same way provider failures already do.

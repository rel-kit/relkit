---
"@relkit/better-auth": patch
---

The type of the service returned by `defineBetterAuthService` carries the role and permission names
of the instance's organization plugin (`ac.statements` and the keys of `roles`, or the plugin's
defaults). `InferBetterAuthAccess` reads them; the generated context registry uses it to type
function access rules. Roles are `string` with `dynamicAccessControl`, and both are `string`
without the organization plugin.

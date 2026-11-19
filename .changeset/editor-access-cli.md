---
"@relkit/cli": patch
---

`relkit dev` and `relkit check` write `interface ApplicationAccess` into
`.relkit/generated/context-registry.d.ts` when the application has a Better Auth service, so
function access rules are typed by the names of its access control. Commit the changed file.

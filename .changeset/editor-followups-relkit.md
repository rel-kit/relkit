---
"relkit": patch
---

Fixed: `profile` in `defineBucket`, `defineCache`, `defineEvent`, `defineEventFunction` and
`defineChannel` accepts only the profile names your application configures for that capability, and
`"default"` when the capability has a single adapter. Your editor suggests them, and a name that is
not a profile is a type error instead of a failure of `relkit check`. The names come from the
generated context registry; run `relkit check` once so it carries them. Without them, as in a
library, `profile` accepts any string. For a name built in code, use `ProviderProfileName` from
`relkit/contracts`.

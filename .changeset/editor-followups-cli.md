---
"@relkit/cli": patch
---

`relkit dev` and `relkit check` write `interface ApplicationProfiles` into
`.relkit/generated/context-registry.d.ts`, so `profile` in buckets, caches, events and channels is
typed by the profile names of `relkit.config.ts`. Commit the changed file.

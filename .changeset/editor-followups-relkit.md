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

Fixed: an option that `defineFunction` or `defineEventFunction` does not have is a type error on
that option, such as `Type 'number' is not assignable to type 'UnknownOption<"timeout">'`; before,
it was accepted and the function failed when it was loaded. The removed option `publishes` is no
longer suggested, and its error names what replaces it:
`RemovedOption<"publishes", "dependencies.events">`.

Fixed: your editor suggests both values of `execution` in `defineTask` on TypeScript 5.9; before, it
suggested `durable` only. `defineTask` and `defineTaskEffect` type the option through a parameter
that defaults to every form; a task that leaves `execution` out is durable, as before.

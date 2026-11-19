---
"relkit": patch
---

Fixed: in `defineApp`, your editor suggests the profile names for each entry of `defaults`, at an
empty value and inside quotes, and `"default"` for a capability with a single adapter. A name that
is not a profile is one type error on that entry that lists the valid names; before, every entry of
`defaults` was reported. A default for a capability without a provider is one type error that names
the capability (`NoProviderConfigured<"model">`), and an option `defineApp` does not have is a type
error even when the call configures providers. Every option of `defineApp`, `server`, `inspector`
and `telemetry` now shows a description in the editor.

`defineApp` and `defineAppEffect` take one type parameter per provider capability instead of one for
all of them. Calls that pass no type arguments, which is how applications call them, are unaffected.

Fixed: with a Better Auth service that uses the organization plugin, `access.roles` and
`access.permissions` of a function accept only the names of the plugin's access control. Your editor
suggests them, and a misspelled name is a type error; before, it was accepted and every caller got
a `403`. Run `relkit check` once so the generated context registry carries the names. For a name
built in code, use `AccessRoleName` and `AccessPermissionName` from `relkit/contracts`.

Fixed: `defineFunction` is one signature instead of two overloads. A mistake in its options is
reported once, where it is, instead of as "No overload matches this call" followed by errors in the
handler, and your editor suggests the kinds of `dependencies`.

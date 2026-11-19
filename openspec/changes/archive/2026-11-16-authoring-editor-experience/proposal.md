# What the editor suggests in RelKit's authoring APIs

## Why

A developer typed a value for `defaults.bucket` in `defineApp` (TypeScript 5.9.3, RelKit 0.9.1) and the editor offered nothing useful: no profile name at an empty value, nothing inside quotes, and three errors for one wrong name, none of which names a valid profile. The question behind it is wider: how does a developer see which options an authoring API has and which values it accepts? Nothing in the repository measures that, so a typing change can make suggestions disappear without a test failing.

## What Changes

- **A survey of every authoring surface.** A language-service driver measures, at 115 positions on a fixture application built from this repository's source, what the editor suggests for a property name, what it suggests for a value whose valid set is known elsewhere in the project, and what it reports for a wrong value. The result is in `evidence/survey.md`, with the cause of every position that does not work and, per surface, the fastest way to see which options exist.
- **`defaults` in `defineApp`.** Each default is typed by the profiles of the same capability in the same call. The editor suggests the profile names at an empty value and inside quotes, and `"default"` for a single adapter. A wrong name is one error on that property that lists the valid names. A default for a capability without a provider is one error that names the capability. An option `defineApp` does not have is a type error; before, it was accepted whenever the call configured a provider.
- **Role and permission names in `access`.** With a Better Auth service, the generated context registry carries the role and permission names of the application's access control, and `access.roles` and `access.permissions` are typed by them. The editor suggests them, and a misspelled name is a type error. Before, a misspelled permission was accepted and every caller got a 403 at request time. Applications are written as before.
- **One signature for `defineFunction`.** It was two overloads. Any mistake in the options of a function with dependencies was reported on TypeScript 5.9 as "No overload matches this call" plus one error per dependency used in the handler; now it is one error where the mistake is. The editor also suggests the kinds of `dependencies`.
- **Descriptions for `defineApp`'s options.** The editor showed no description for any of the 18 options; each now has one, and so do the options of `server`, `inspector` and `telemetry`, and `title`, `description` and `tags` everywhere.
- **The survey stays as a test.** A few assertions per surface run with `bun run test:types`, on TypeScript 5.9 through its language service and on TypeScript 7 through its language server.

No runtime behaviour changes. `defineApp` and `defineAppEffect` take one type parameter per provider capability instead of one for all of them; a call that passes no type arguments, which is every call in the repository, its examples and its templates, is unaffected.

## Capabilities

### Modified Capabilities

- `public-authoring`: what `defineApp` types and reports for `defaults` and for unknown options; how a mistake in `defineFunction`'s options is reported.
- `access-control`: role and permission names in a function's access rule are typed from the application's Better Auth access control.
- `typescript-compatibility`: editor behaviour of the authoring APIs is verified on both supported compilers.

## Impact

- Packages: `relkit` (types of `defineApp`, of `defineFunction`, of the access rule, and the registry it reads), `@relkit/better-auth` (the service's handler type carries the access control's names), `@relkit/cli` (the generated context registry).
- Generated output tracked in the repository: the context registries of the examples and templates that have a Better Auth service, and the API reference pages.
- Tests: `tests/editor/` (fixture, drivers, assertions), `tests/types/config.ts`, the generator's tests.
- Evidence: `evidence/survey.md` in this change.

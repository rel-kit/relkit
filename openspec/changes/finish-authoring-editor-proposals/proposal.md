# Finish what the editor survey proposed

## Why

The change `authoring-editor-experience` measured 115 editor positions in the authoring APIs, fixed `defaults` in `defineApp`, the role and permission names of `access` and the overloads of `defineFunction`, and listed six things it measured but did not do. Ten positions still do not work, 134 options show no description in the editor, and the API pages hide the members of three option types. This change does the five items that RelKit's types and generators can do.

## What Changes

- **Profile names in descriptors.** The generated context registry carries the application's profile names per capability, read from the type of `relkit.config`. `profile` in `defineBucket`, `defineCache`, `defineEvent` and `defineChannel` is typed from it: the editor suggests the names, `"default"` for a capability with one adapter, and a name that is not a profile is a type error. Without names in the registry (a library, or an application that has not generated it again) `profile` stays `string`.
- **Unknown options are one error on the extra key.** In `defineFunction` and `defineEventFunction`, an option the API does not have is typed `UnknownOption<"name">`, so the error is on that key and names it. The removed `publishes` is no longer suggested, and its error names `dependencies.events`. `defineTask` and `defineJob` already report an extra key through TypeScript's own check.
- **One signature.** `defineTask` suggests both values of `execution` on TypeScript 5.9, and `defineRoute` is one signature instead of an overload per form, so a mistake in a route's option is reported on that option.
- **Descriptions for the remaining options.** Every option an editor lists for an authoring API has a one-line description.
- **API pages show option members.** `ServerConfig`, `InspectorConfig` and the telemetry options are printed with their members instead of `declare const`, and the provider options are in the `defineApp` block.

No runtime behaviour changes and no public API is removed. An application that upgrades without generating its registry again type-checks as before.

## Capabilities

### Modified Capabilities

- `public-authoring`: profile names, unknown options and the forms of `defineTask` as types.
- `developer-documentation`: descriptions of options in the editor and members of option types on the API pages.

## Impact

- Packages: `relkit` (types of the descriptors, tasks, jobs and events; the registry interface), `@relkit/cli` (the generated context registry), and any package whose options gain descriptions.
- Generated output tracked in the repository: the context registries of the examples and templates, and the API reference pages.
- Tests: `tests/editor/probes/` (flipped verdicts and new positions), `tests/types/`, the generator's tests.

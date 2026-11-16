# Tasks

> A box is checked only after the verification named in its task has run and passed. Types and generators only: no runtime behaviour changes. Keep files at or under 250 lines and add one changeset per package touched.

## 1. Profile names

- [x] 1.1 Add probes for `profile` in `defineChannel` and record the wanted verdicts for `defineBucket`, `defineCache` and `defineEvent`; verify the editor test fails on these positions before the change.
- [x] 1.2 Declare `Relkit.ApplicationProfiles`, type `profile` from it and generate the interface into the context registry; verify the editor test passes on both compilers, the generator's test passes, and `tests/types/` passes with TypeScript 7's and 5.9's `tsc`.
- [x] 1.3 Regenerate the tracked output of the examples and templates; verify a second `bun run check` leaves `git status` unchanged and the examples type-check.

## 2. Unknown options

- [x] 2.1 Add probes for an unknown option in `defineEventFunction`, `defineTask` and `defineJob` and record the wanted verdicts for `defineFunction`; verify the editor test fails on them before the change.
- [x] 2.2 Type unknown keys as `UnknownOption` and `publishes` as `RemovedOption`; verify the editor test and `tests/types/` on both compilers.

## 3. One signature

- [x] 3.1 Record the wanted verdict for `execution` in `defineTask` on TypeScript 5.9 and add type tests for the context of each form; verify the editor test fails on the position before the change.
- [x] 3.2 Replace the overloads of `defineTask` and of any other authoring API with one signature; verify the editor test and `tests/types/` on both compilers, with every existing `@ts-expect-error` unchanged.

## 4. Descriptions

- [x] 4.1 Add a one-line description to every option without one; verify `bun tests/editor/inventory.ts` reports how many remain and `bun scripts/user-text.ts` passes.

## 5. API pages

- [x] 5.1 Print re-exported interfaces with their members and list the provider options in `DefineAppOptions`; verify `app.mdx` shows the members of `ServerConfig`, `InspectorConfig` and the telemetry options, and `generate:check` passes.

## 6. Proof and archive

- [x] 6.1 Add the changesets and regenerate the documentation; verify `bun run changeset status` and `generate:check`.
- [x] 6.2 Measure `profile` on a plain copy of the logistics application before (0.9.1) and after, and run its `tsc --noEmit`; delete the copy.
- [ ] 6.3 Run `bun run prepush`, `bun run test:types`, `bun run test:packages` and `openspec validate --specs`; verify each passes, then archive the change.

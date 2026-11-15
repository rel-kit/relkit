# Tasks

> A box is checked only after the verification named in its task has run and passed. Types only: no runtime behaviour changes. Keep files at or under 250 lines and add one changeset per package whose types or generated output change.

## 1. Survey

- [x] 1.1 Add the language-service driver, the fixture application and the probes for every authoring surface under `tests/editor/`; verify the fixture has no type error and every probe's anchor occurs once.
- [x] 1.2 Add the TypeScript 7 language-server driver; verify it answers completions, diagnostics and hover for the fixture.
- [x] 1.3 Measure every position on both drivers before any fix and write `evidence/survey.md`: surface, position, what the editor shows, what a developer expects, verdict and cause, the option inventory with descriptions and API pages, and the per-surface answer to "how does a developer see what exists".
- [x] 1.4 Measure the two known defects on the logistics application with RelKit 0.9.1 and record the lists and error texts as the "before" of the proof.

## 2. `defaults` in `defineApp`

- [x] 2.1 Record the wanted verdicts in the probes (suggested at an empty value and inside quotes, `default` for one adapter, one error naming the valid profiles, one error naming a capability without a provider, unknown option reported); verify the editor test fails on these positions before the change.
- [x] 2.2 Give `defineApp` and `defineAppEffect` one type parameter per capability and type `defaults` from them; verify the editor test passes on both drivers.
- [x] 2.3 Extend `tests/types/config.ts` with the single-adapter default, the capability without a provider and the unknown option; verify `bun run test:types` and the same project with TypeScript 5.9's `tsc`.
- [x] 2.4 Verify every `relkit.config.ts` of `examples/`, `templates/` and the test fixtures type-checks unchanged: `bun run test:examples` type-check tasks and `tsc -b`.
- [x] 2.5 Add descriptions to `defineApp`'s options, to the options of `server`, `inspector` and `telemetry`, and to `title`, `description` and `tags`; verify `bun tests/editor/inventory.ts` reports none without a description in the seven `defineApp` rows.

## 3. Role and permission names in `access`

- [x] 3.1 Record the wanted verdicts in the probes (names suggested, one error for a misspelled name); verify the editor test fails on these positions before the change.
- [x] 3.2 Carry the access control's names on the Better Auth service's handler type and add `InferBetterAuthAccess`; verify with a type test for an instance with `ac` and `roles`, with the plugin's defaults, with dynamic access control and without the plugin.
- [x] 3.3 Generate `interface ApplicationAccess` into the context registry when a Better Auth service exists; verify with the generator's tests.
- [x] 3.4 Type `access.roles` and `access.permissions` from the registry; verify the editor test passes on both drivers and `bun run test:types` passes.
- [x] 3.5 Regenerate the tracked registries of the examples and templates; verify `bun run check` in each leaves `git status` unchanged on a second run.

## 4. One signature for `defineFunction`

- [x] 4.1 Record the wanted verdicts in the probes: a misspelled permission is one error on TypeScript 5.9 too, and the kinds of `dependencies` are suggested; verify the editor test fails on these positions with the two overloads (five errors; the whole scope).
- [x] 4.2 Replace the two overloads of `defineFunction` and `defineFunctionEffect` with one signature and repeat the constraint on `dependencies`; verify the editor test passes on both drivers and `tests/types/` passes unchanged with TypeScript 7's and TypeScript 5.9's `tsc`.

## 5. Documentation and release notes

- [x] 5.1 Document the editor behaviour of `defaults` and of `access` names where the options are described; verify `bun scripts/user-text.ts`.
- [x] 5.2 Run `bun run --cwd apps/docs generate`; verify `generate:check` passes.
- [x] 5.3 Add the changesets; verify `bun run changeset status` lists the touched packages.

## 6. Permanent test

- [x] 6.1 Run the editor test from `bun run test:types` on both drivers; verify it passes and record how long it takes (232 assertions in about 22 seconds; `test:types` in about 25).
- [x] 6.2 Verify a regression fails it: restore the earlier `defineApp` types in the working tree, see the test fail, put the change back.

## 7. Proof and archive

- [ ] 7.1 Run `bun run prepush`; verify it passes.
- [ ] 7.2 Run `bun run test:types`; verify it passes.
- [ ] 7.3 Run `bun run test:packages` to its end; verify every set of tests passes.
- [ ] 7.4 Run `openspec validate --specs`; verify it passes, then archive the change with `openspec archive authoring-editor-experience -y`.
- [ ] 7.5 Install the built packages into a plain folder copy of the logistics application and run the kept survey there; record before and after for the two known defects; delete the copy.

# Tasks

> A box is checked only after the verification named in its task has run and passed.

## 1. Deprecate the option

- [x] 1.1 Add tests that fail first: the editor marks `logging` as deprecated and still accepts it; `relkit check` warns per task and passes; Inngest accepts the policy; the option is not sent with a run.
- [x] 1.2 Add the `@deprecated` tag, the catalog code, the check warning, and leave the option out of the submitted policy and of Inngest's refusal; verify the tests pass.
- [x] 1.3 Add a test that pins what the server passes to an Inngest worker definition, and record in the evidence whether `maxDuration` is enforced on Inngest.

## 2. Documentation and record

- [x] 2.1 Update the option's description, the guide, the changesets and the generated pages; verify `generate:check` and `bun run changeset status`.
- [ ] 2.2 Run `bun run prepush`, `bun run test:types`, `bun run test:packages` and `openspec validate --specs`; verify each passes, then archive the change.

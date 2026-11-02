# Writing standard

This standard covers every word a RelKit user reads: the README, the docs site, package READMEs,
template READMEs, CLI help and output, error messages, the error-code catalog and the changelog.
`bun scripts/user-text.ts` checks the parts that can be checked; reviewers check the rest.

## Product name

- Write **RelKit** in prose, headings, help text and messages.
- Never write `RELKIT` or `Relkit` outside code. The check fails on both.
- Package names, commands, environment variables and error codes keep their own spelling:
  `relkit`, `create-relkit`, `@relkit/app`, `RELKIT_ENV`, `RELKIT_SCHEMA_UNAVAILABLE`.
- The `Relkit` type namespace that applications augment (`declare global { namespace Relkit { … } }`)
  is code and keeps its name.

## Voice

- Write for an application developer who has not read RelKit's source.
- Use short sentences, the active voice and the present tense. Say "you".
- Lead with what the reader can do, then the details.
- Use sentence case for headings, titles, buttons and labels.
- Name the file or terminal before asking the reader to change or run something, and say what
  they should see afterwards.
- Do not write "simply", "just", "easy" or "obviously". Do not use exclamation marks.
- Put commands, flags, file names, identifiers and values in backticks.

## Banned terms

These words describe how RelKit is built and released, not how to use it. Do not use them in
user-facing prose. The check fails on them in the README, docs pages that are not generated,
package and template READMEs, CLI help, CLI failure messages and the error-code catalog.

| Do not write       | Write instead                                                         |
| ------------------ | --------------------------------------------------------------------- |
| tuple              | combination (of options)                                              |
| certified          | tested, supported                                                     |
| readiness evidence | test results                                                          |
| receipt            | confirmation, record, acceptance record, migration record             |
| capsule            | snapshot, copy                                                        |
| cohort             | set of packages, tested package versions, versions that work together |
| admission          | acceptance, access check                                              |

An identifier that contains one of these words, such as `AcceptRunReceipt`, is fine in backticks.
Generated API reference pages describe identifiers and are not checked for banned terms.

Instructions meant for coding agents belong in `AGENTS.md` and the skills under `.agents/skills`,
not in the README or the docs.

## Messages

Every error or warning the CLI or runtime shows has four parts:

1. A stable `RELKIT_*` code.
2. What happened, in one sentence.
3. The next step: a command to run, a file to change or an option to pass.
4. A link to the code's docs page.

```txt
RELKIT_SCHEMA_UNAVAILABLE: input of orders.create cannot produce a JSON Schema.
  next: Use a schema library that can describe itself as JSON Schema, such as Zod 4.
  docs: https://relkit.dev/docs/errors/relkit-schema-unavailable
```

Each code has an entry in the catalog under `packages/diagnostics/src/codes/`. The entry holds the
code's title, what happened, the next step and, rarely, a hand-written docs page. The docs site
generates one page per code from the catalog, and docs generation fails when a code the source can
emit has no entry. To add a code:

1. Emit it with a message that names the thing that failed.
2. Add its entry to the catalog file for the package that emits it.
3. Run `bun run --cwd apps/docs generate` to create its page.

Keep codes stable: a code is part of the public interface. Rename one only in a breaking release,
with a migration note.

## Changelog

`CHANGELOG.md` has one section per release, newest first, headed by the release version. Each
section groups changes under **Breaking**, **New** and **Fixed**, in that order, and leaves out
empty groups. Each change is one line that says what changed for the user:

```md
## 0.9.0

### Breaking

- `relkit/schema` exports the built-in builder as `s` instead of `z`. [Migration](https://relkit.dev/docs/guides/migrate/0-9#schema-builder)

### New

- Functions accept Valibot and Effect Schema contracts.

### Fixed

- `relkit dev` keeps serving the last good build when a save fails to compile.
```

Every Breaking line links to its section of the migration guide; versioning fails on a Breaking
change without one. Changeset summaries become these lines, so write each changeset summary as one
finished changelog line. Start the summary with `Breaking:`, `New:` or `Fixed:` to choose its group.
Without a prefix, a major bump is Breaking, a minor bump is New and a patch is Fixed. The release
notes repeat the release's section under **Changes**.

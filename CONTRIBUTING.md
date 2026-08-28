# Contributing to RELKIT

Thank you for improving RELKIT. Please open an issue before substantial design
work so maintainers can confirm scope and avoid duplicate effort.

## Development

Install Bun `1.3.10`, clone the repository, and run:

```sh
bun install --frozen-lockfile
bun run build
bun run verify
```

Use the focused scripts documented in `AGENTS.md` while iterating. Do not run
the AWS acceptance suite unless a maintainer explicitly authorizes the cost and
provides an isolated environment.

## Changesets

Run `bun run changeset` for a user-visible package change and commit the
generated Markdown file. Documentation, tests, and internal chores do not need
a changeset. All public packages ship on one fixed version, so select the
package whose public behavior changed rather than listing the whole workspace.

## Pull requests

Keep changes focused, add the smallest regression check that proves non-trivial
behavior, and update public documentation when the contract changes. Pull
requests must pass `CI Gate`; maintainers squash-merge approved work.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

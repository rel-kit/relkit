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

Pull requests from this repository automatically receive a patch Changeset when
they touch a publishable package, the bundled templates, or the bundled
inspector. Documentation and internal chores outside those release paths do not
produce a release. Forks must run `bun run changeset` and commit the generated
Markdown file because GitHub does not grant their workflows write access.

Automatic Changesets are intentionally patch-only. Run `bun run changeset`
before pushing when a public change requires a minor or major bump; automation
preserves that explicit release intent. All public packages ship on one fixed
version, so select the package whose public behavior changed rather than the
whole workspace.

## Bootstrap the unscoped CLI package

The first `relkit` publication requires an authenticated maintainer. Publish
the validated `relkit-<version>.tgz` archive from the release artifact directory
with `npm publish`, then configure the same trusted publisher used by the other
packages:

```sh
npm trust github relkit --repository rel-kit/relkit \
  --file ci.yml --environment npm --allow-publish
```

The package must exist and the account must have write access and 2FA enabled
before configuring [npm trusted publishing](https://docs.npmjs.com/cli/v11/commands/npm-trust/).
Subsequent releases publish the wrapper after its exact `@relkit/cli` dependency
through the existing release workflow.

## Pull requests

Keep changes focused, add the smallest regression check that proves non-trivial
behavior, and update public documentation when the contract changes. Pull
requests must pass `CI Gate`; maintainers squash-merge approved work.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

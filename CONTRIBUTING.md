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

`bun run version:packages` certifies the new release after synchronizing package
and template versions. It records 20 fresh starts and 20 restarts from packed
packages, including restart preparation, and requires every complete correct
response and clean shutdown within the existing 30-second terminal deadline
before updating the creation allow-list. Failed functional certification
restores the previous allow-list and evidence and stops release PR generation.
To repair a versioned candidate, run `bun scripts/certify-create.ts`; never copy
an older release's reports or change their recorded version numbers.
Failed reports remain at the path printed by the driver and are uploaded as
workflow artifacts when automated versioning fails.
The driver disposes of temporary measured projects after recording their results
so certification does not accumulate twenty separate dependency installations.
For a release-branch repair, dispatch the existing CI workflow on
`changeset-release/main` with `certify_create=true`. Its optional certification
job uploads passing candidate source and reports as a commit-specific artifact
for review; it has read-only repository access. Regular CI checks remain required.
Release readiness runs on free x64 Ubuntu with Turbo and Vitest limited to one
worker and a 2 GiB Node heap cap. Version-2 `candidate-readiness` reports retain
the strict one-second performance verdict in `summary` and record functional
admission separately in `readiness`. Slow starts produce a workflow warning and
remain in the evidence; they cannot be relabeled as performance passes.
Version-1 strict reports remain valid historical evidence without modification.
Run `bun scripts/certify-create.ts --performance` or dispatch **Startup
performance** for strict one-second certification. That independent, read-only
workflow runs on standard `macos-15` Apple Silicon and fails on any slow sample.
It retains original reports even on failure. Shared runners have variable host
load, so performance failure alone does not block functional release admission.
Each completed measurement is checkpointed so later project-creation failure
cannot discard earlier attempts. Reports identify the actual host; passing one
host does not establish a latency bound for every machine.
Regular CI and `bun run prepush` also build and trace the packaged startup graph.
Its eager size budget keeps the ordinary TypeScript watcher behind a lazy import;
prepared sessions continue to use their existing integrity epoch watcher.
On Linux, that watcher observes authored trees and the installed directories
needed by the authenticated receipt, including ancestors of absent resolution
paths. It avoids recursively traversing unrelated installed dependencies. A
different receipt generation cannot reuse the earlier watch plan.
`bun run test:certification` runs the packing, registry, startup graph, watch,
checkpoint, and fixture cleanup regression checks shared by CI and pre-push.
The certification step has a shorter deadline than its job so failure artifacts
can still upload when a native setup operation stalls.

Successful release-PR CI owns the publication handoff independently of the
versioning job. It waits briefly for the reviewed PR to merge, then dispatches
CI for its exact merge commit when no main CI run exists. Successful push or
manually dispatched CI on the current `main` commit starts the release workflow.
This explicit dispatch handles bot merges whose token suppresses push workflows.
For recovery, dispatch CI on `main`; its successful completion resumes release
selection. Publishing verifies every package's registry integrity before the
GitHub release is declared complete. Later CI-only or documentation changes skip
an already completed release instead of rebuilding and republishing its version.

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

# Contributing to RELKIT

Thank you for improving RELKIT. Please open an issue before substantial design
work so maintainers can confirm scope and avoid duplicate effort.

## Development

RELKIT is experimental, interfaces may change, and current consumers are the
repository samples. Update affected samples directly within a scoped change;
preserve data and applied migration history. Do not add legacy upgrade commands
or compatibility layers merely to retain an experimental sample's old layout.

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

`bun run version:packages` records the exact package/version list in
`.changeset/release.json` after applying Changesets and synchronizing template
pins. Packages have independent versions; the root changelog and `v` tag number
identify the release batch, not a version shared by every package. When the
generator is in that batch, versioning certifies it with 20 fresh starts and
20 restarts from packed
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

The release GitHub App creates and updates release PRs and enables auto-merge.
Normal pull-request CI must pass before merging; the App's merge then triggers
normal main CI. Successful main CI starts Release for the exact verified commit.
Superseded CI commits are skipped. Manually dispatched main CI can also explicitly
start Release, which verifies the CI run's actual successful conclusion.

Publishing validates the complete local packed closure, then saves and publishes
only the packages in the reviewed batch, in dependency order. First-party
dependencies retain their own exact versions. Template dependency and optional
provider changes also release the generator because those pins are bundled
assets. Root package/catalog changes conservatively release the whole workspace;
patch and catalog-builder changes release their metadata owners. Existing
package versions are checked against the original tarball integrity and never
overwritten. A package is considered published only after registry verification.

### GitHub App setup

1. Register a GitHub App owned by `rel-kit`, for example **RELKIT Release**.
   Disable webhooks; no webhook endpoint or user permissions are needed.
2. Give it repository **Contents: read and write** and **Pull requests: read and
   write** permissions. Historical release recovery also requires **Workflows:
   read and write**: GitHub requires it when the original release commit's workflow
   files differ from current main. Metadata read access is automatic. No Actions,
   administration, or branch-protection bypass permission is needed.
3. Install it on the `rel-kit/relkit` repository only. Generate a private key.
4. Add repository Actions variable `RELEASE_APP_CLIENT_ID` with the App's client ID
   (not its numeric App ID), and Actions secret `RELEASE_APP_PRIVATE_KEY` with the full
   PEM private key. Never commit the key.
5. Enable repository auto-merge and keep `CI Gate` required for `main`. The App
   follows the existing merge requirements; it does not bypass them.

Both automatic Changeset commits and release PR writes use repository-scoped,
short-lived App tokens. Their tokens request only Contents and Pull requests;
only the historical GitHub release recovery step requests Contents and Workflows.
Fork checks never receive the key. Missing configuration
stops release PR generation with a setup error; there is no `GITHUB_TOKEN`
fallback that would recreate approval-expired runs. npm continues to use OIDC
trusted publishing in **ci.yml**, environment **npm**, with
`NPM_RELEASES_ENABLED=true`; existing npm trusted-publisher settings stay in place.

### Recover a partial release

Use the original **Release** run ID, even after `main` advances:

```sh
gh workflow run ci.yml --repo rel-kit/relkit --ref main \
  -f recovery_run_id=39413146882
```

The workflow checks that the source run belongs to this repository's main release
workflow, completed, and successfully validated its archives. It requires the
source commit to be an ancestor of current main, downloads the original artifact
by ID, and independently checks its manifest and checksums. Recovery skips
building and republishes only missing exact versions. It accepts historical v1
manifests as well as scoped v2 manifests. A checksum or registry integrity conflict
fails explicitly; recovery cannot replace an immutable npm version.

Repeated CI for the same release commit automatically reuses its earlier
successful pack. A new batch cannot be versioned while the preceding recorded
batch remains unfinished. New release archives and npm diagnostics are retained
for 30 days. Missing,
expired, or ambiguous archives stop recovery; do not rebuild a partially published
version. If a higher package version already exists, a recovered older package
uses a batch-specific dist-tag instead of lowering npm `latest`. Recovery also
preserves a newer GitHub latest release. The GitHub release
is completed only after all selected npm integrities match. Later CI-only or
documentation changes skip completed batches. For an unfinished earlier batch,
use recovery rather than packing it from a later commit.

Pull requests from this repository automatically receive a patch Changeset when
they touch a publishable package, the bundled templates, or the bundled
inspector. Documentation and internal chores outside those release paths do not
produce a release. Forks must run `bun run changeset` and commit the generated
Markdown file because GitHub does not grant their workflows write access.

Automatic Changesets are intentionally patch-only. Run `bun run changeset`
before pushing when a public change requires a minor or major bump; automation
preserves that explicit release intent and adds patch Changesets for uncovered
changed packages without replacing authored files. Select the packages whose public behavior
changed. Changesets includes required dependents; unrelated packages keep their
versions. For example, a generator-only change releases `create-relkit`,
`@relkit/cli`, and `relkit`, rather than the entire workspace.

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

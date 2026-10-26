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

`build`, `version:packages`, `release:sync`, `release:check`, and `release:pack`
share `build:tooling`, which compiles the contracts used by repository tooling
before loading it. Use these package scripts from a fresh checkout; invoking
their implementation files directly assumes those prerequisites already exist.

`bun run version:packages` records the exact package/version list in
`.changeset/release.json` after applying Changesets and synchronizing template
pins. It then builds the documentation's CLI and creator inputs and regenerates
version-derived install instructions, source snippets and CLI reference before
the release PR is committed. Use `bun run version:docs` to refresh those outputs
on an already versioned candidate without applying Changesets again.
Packages have independent versions; the root changelog and `v` tag number
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

`CI Gate` also requires release rehearsal. One read-only job installs frozen,
runs the real versioning command (including generator certification when needed),
and checks synchronization again. It transfers only a source patch to a second
fresh checkout, which installs frozen and runs `release:pack --ci-pack` without
publication credentials. The jobs share no compiled output or build cache.
Already versioned release PRs check their existing batch and run the same pack
validation. A green lint/typecheck run alone does not satisfy this gate.
The pack job also checks public npm registration for every candidate package.
Missing packages or failed registry lookups block merge. This read-only check
cannot inspect npm's private trusted-publisher configuration.

Publishing validates the complete local packed closure, then saves and publishes
only the packages in the reviewed batch, in dependency order. First-party
dependencies retain their own exact versions. Template dependency and optional
provider changes also release the generator because those pins are bundled
assets. Root package/catalog changes conservatively release the whole workspace;
patch and catalog-builder changes release their metadata owners. Existing
package versions are checked against the original tarball integrity and never
overwritten. A package is considered published only after registry verification.
Accepted npm uploads can take several minutes to become public. The publisher
allows up to 180 visibility checks with five-second pauses (about fifteen minutes,
plus registry lookup time) before failing with the original-artifact recovery command.

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
short-lived App tokens. PR preparation requests only Contents; release PR writes
request Contents and Pull requests;
only historical GitHub publication requests Contents and Workflows.
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

Repeated CI and rerun attempts automatically reuse the earlier successful pack.
Selection uses the workflow's immutable main snapshot. An unfinished batch belongs
to the first main commit introducing its version, even if later merges add more
Changesets or reformat the plan. Its first pack requires successful CI for that
exact source; later attempts require the original archives. A semantic plan edit
without a new batch version is rejected. A new batch cannot be versioned while the
preceding recorded batch remains unfinished. New release archives and npm diagnostics are retained
for 30 days. Missing,
expired, or ambiguous archives stop recovery; do not rebuild a partially published
version. If a higher package version already exists, a recovered older package
uses a batch-specific dist-tag instead of lowering npm `latest`. Recovery also
preserves a newer GitHub latest release. The GitHub release
is completed only after all selected npm integrities match. Later CI-only or
documentation changes skip completed batches. Every main commit has its own CI
concurrency group. Releases serialize through GitHub's pending queue and reconcile
newer successful main CI after publication or a superseded snapshot. This lets a
merge arriving during publication proceed to the next batch without rebuilding
the preceding batch from newer source. If follow-up dispatch fails, rerun Release;
it rechecks publication state and continues from the immutable original archives.

Pull requests from this repository automatically receive a patch Changeset when
they touch a publishable package, the bundled templates, or the bundled
inspector. Documentation and internal chores outside those release paths do not
produce a release. Forks must run `bun run changeset` and commit the generated
Markdown file because GitHub does not grant their workflows write access.

PR CI checks Changeset coverage with read-only access. After it completes,
**Prepare pull request** runs trusted `main` code, reads the PR's Git objects as
data, and generates any missing Changeset. It acquires the App token only after
preparing the commit. GitHub applies that commit only if the PR head still matches,
then runs normal CI again. PR code never receives the App key or token, including
Dependabot PRs; the Actions secret does not need a duplicate Dependabot secret.

Dependabot security updates have explicit Bun and npm configuration. Archived
OpenSpec evidence, recorded evidence and vendored repositories are excluded.
For a same-repository Dependabot PR, a read-only preparation job promotes changed
catalog-owned pins from active manifests to the root catalog, restores historical
evidence, synchronizes templates/integration metadata, regenerates `bun.lock`
with Bun 1.3.10, and proves a frozen install plus a second clean synchronization.
The trusted workflow admits only the exact run's bounded data artifact and known
tracked dependency files; archived evidence must match its original bytes.
All acceptance jobs continue to install with `--frozen-lockfile`.

When first rolling out this automation, update existing Dependabot branches onto
the new `main` before rerunning them: older heads do not contain the preparation
script. Verify a normal PR and a Dependabot PR through CI, the version PR, clean
packing, publishing and original-artifact recovery before considering the hosted
lifecycle verified. Local tests cannot establish GitHub secret access or npm OIDC.

Automatic Changesets are intentionally patch-only. Run `bun run changeset`
before pushing when a public change requires a minor or major bump; automation
preserves that explicit release intent and adds patch Changesets for uncovered
changed packages without replacing authored files. Select the packages whose public behavior
changed. Changesets includes required dependents; unrelated packages keep their
versions. For example, a generator-only change releases `create-relkit`,
`@relkit/cli`, and `relkit`, rather than the entire workspace.

## Register new npm packages

Every new public package, including `relkit`, requires one authenticated
maintainer publication before npm can accept its trusted-publisher configuration.
Before merging it, build and validate its bootstrap archive with the repository's
release tooling. Choose a bootstrap version strictly lower than the upcoming
package version in the Changesets batch. A higher bootstrap version would prevent
the automated publisher from promoting the real release to `latest`.
Publish only the new package archives in dependency order with the `bootstrap`
tag, then configure the same trusted publisher used by the other packages:

```sh
npm publish path/to/new-package-0.1.0.tgz --access public --tag bootstrap
npm trust github @relkit/new-package --repository rel-kit/relkit \
  --file ci.yml --environment npm --allow-publish
```

Substitute the new package name and validated archive path. The account must have
write access and 2FA enabled; complete npm's browser authorization when prompted.
See [npm trusted publishing](https://docs.npmjs.com/cli/v11/commands/npm-trust/).
After the first automated release succeeds, deprecate the bootstrap version and
remove its `bootstrap` tag. Subsequent releases use the existing workflow,
including publishing the wrapper after its exact `@relkit/cli` dependency.

## Pull requests

Keep changes focused, add the smallest regression check that proves non-trivial
behavior, and update public documentation when the contract changes. Pull
requests must pass `CI Gate`; maintainers squash-merge approved work.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

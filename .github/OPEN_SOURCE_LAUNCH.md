# Open-source launch checklist

Repository automation is ready before visibility changes. Complete these owner
steps in order; do not rewrite Git history or publish from CI during bootstrap.

## Before making the repository public

- [x] Scan all 245 commits with Gitleaks `8.29.0`. Thirteen exact findings were
      reviewed as release checksums, generated descriptor keys, synthetic redaction
      fixtures, or vendored Effect examples/protocol values and recorded in
      `.gitleaksignore`; the independent second scan found zero unreviewed findings.
- [x] Audit tracked binaries. They are documentation/E2E PNG screenshots plus
      Effect's vendored `helloworld.tar.gz` test fixture; no executable binary is tracked.
- [x] Confirm `repos/effect/LICENSE` is MIT and retained with the vendored
      reference source. The vendored tree is excluded from npm release staging.
- [x] Recheck the public npm registry on 2026-08-28; all 36 package names return
      `404` and have no public collision. Organization ownership still requires
      an authenticated owner check before bootstrap.
- [ ] Decide whether the historical Git author address
      `mu.elsayed@tamkeentech.sa` may become public. Do not rewrite history without
      a separate reviewed migration.
- [ ] Rotate any credential found by a future scan before changing visibility.

Reproduce the history scan from the repository root:

```sh
docker run --rm -v "$PWD:/repo:ro" ghcr.io/gitleaks/gitleaks:v8.29.0 \
  git --no-banner --no-color --redact --log-opts="--all" --timeout=600 /repo
```

## GitHub settings after visibility is public

- [ ] Create a `main` ruleset requiring pull requests, `CI Gate`, and resolved
      conversations. Block deletion and force pushes; grant no bypasses.
- [ ] Keep approvals at zero while there is one maintainer. With a second
      maintainer, require one approval and CODEOWNER review.
- [ ] Allow squash merging only. Enable auto-merge and automatic branch deletion.
- [ ] Keep Actions tokens read-only by default and allow Actions to create pull
      requests. Require full-SHA actions and allow only the actions in `ci.yml`.
- [ ] Install the official Changesets bot for advisory missing-changeset comments;
      do not make a changeset mandatory for documentation, tests, or chores.
- [ ] Create the `npm` environment restricted to `main`, with no npm token.
- [ ] Create `NPM_RELEASES_ENABLED=false` as a repository variable.
- [ ] Enable CodeQL default setup, secret scanning with push protection, private
      vulnerability reporting, dependency alerts/updates, and dependency review.
- [ ] Enable immutable releases before publishing `v0.0.1`.

## npm bootstrap at `0.0.0`

Confirm ownership and enforced 2FA for the `@relkit` organization, then install
Node 24 and npm `11.19.0`. From a clean `0.0.0` checkout, build the same validated
archives used by CI:

```sh
npm install --global npm@11.19.0
bun install --frozen-lockfile
release_dir="$(mktemp -d)"
bun run scripts/release-check.ts --output "$release_dir"
node --experimental-strip-types scripts/publish-release.ts --directory "$release_dir"
```

Publish each file in `manifest.json` order with browser authentication and 2FA.
Do not create or store a GitHub npm token:

```sh
jq -r '.packages[].file' "$release_dir/manifest.json" | while IFS= read -r archive; do
  npm publish "$release_dir/$archive" --access public --tag bootstrap
done
```

After all packages exist, configure trusted publishing for every manifest entry:

```sh
jq -r '.packageOrder[]' "$release_dir/manifest.json" | while IFS= read -r package; do
  npm trust github "$package" --repo rel-kit/relkit --file ci.yml --env npm --allow-publish --yes
done
```

In npm settings, require 2FA for publishing, disallow traditional tokens, and
revoke bootstrap credentials. Set `NPM_RELEASES_ENABLED=true`, then merge the
green reviewed release pull request.

## Verify `0.0.1`

- [ ] Confirm every package reports `0.0.1` under the `latest` dist-tag with
      matching integrity and provenance.
- [ ] Install `create-relkit@0.0.1` and `@relkit/app@0.0.1` in a clean directory;
      generate all templates and run check, test, and build.
- [ ] Deprecate each `0.0.0` package as bootstrap-only and remove its `bootstrap`
      dist-tag.
- [ ] Confirm one immutable GitHub release `v0.0.1` contains the manifest,
      checksums, release notes, and all tarballs.

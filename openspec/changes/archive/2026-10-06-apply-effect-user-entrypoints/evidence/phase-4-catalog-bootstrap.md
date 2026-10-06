# Pure catalog bootstrap integration

Author: /root/native_gate. Root independently reviewed the supporting source.

Review found a cold bootstrap cycle: build first checks release metadata, whose
catalog resolver imported create-relkit's compiled barrel and therefore required
generator/compiler dist before the topological build.

The package now exports create-relkit/catalog-resolution directly to its two pure
source TypeScript assets. Root tooling runtime/type wrappers use this narrow
subpath. The generator's public compiled barrel and CLI's portable public import
remain intact. Export/files/release synchronization guards carry exactly those
two source assets in addition to dist. No second resolver implementation exists.

Supporting TypeScript changes independently reviewed by root:
packages/create-relkit/src/catalog-resolution.ts (type export only),
scripts/catalog-manifest.ts, scripts/catalog-manifest.types.ts,
scripts/sync-release.ts, scripts/release-package-contract.ts,
scripts/release-check-support.ts, tests/unit/catalog-bootstrap.test.ts,
tests/unit/sync-release.test.ts. Generator package metadata contains the new
pure subpath and source pair.

Verification: six focused tests pass. An isolated installed-shape consumer has
neither generator dist nor framework dependencies and resolves default/named peer
versions while rejecting missing entries. An actual Bun tarball contains byte
identical source assets; the same dist-free consumer succeeds from those packed
assets. The release fixture models a post-install workspace package link and
proves metadata synchronization/idempotence without generator dist.

Strict supporting compiler check with skipLibCheck:false passes; existing Bun
source .ts imports require allowImportingTsExtensions under noEmit. Formatting
passes and read-only sync-release freshness passes.
Logs: /tmp/relkit-catalog-bootstrap-{tests,strict,sync,format}.log.

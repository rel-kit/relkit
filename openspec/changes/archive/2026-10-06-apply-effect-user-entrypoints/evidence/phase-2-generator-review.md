# Independent phase-two generator review

Reviewer: coordinator, independent of the generator author. All 21 changed/new
TypeScript files below were read through EOF, including the revised catalog
adapter, transitive-owner tests, and starter acceptance helper. Shared pure
catalog-resolution files are independently covered by the native reviewer.

## Coverage

- `packages/create-relkit/src/add-transaction-files.ts`
- `packages/create-relkit/src/add-transaction.ts`
- `packages/create-relkit/src/build-catalog.ts`
- `packages/create-relkit/src/dependency-patch-installation.ts`
- `packages/create-relkit/src/dependency-patches.ts`
- `packages/create-relkit/src/dependency-patches.types.ts`
- `packages/create-relkit/src/generate.ts`
- `packages/create-relkit/src/index.ts`
- `packages/create-relkit/src/plan-builder.ts`
- `packages/create-relkit/src/plan-manifest.ts`
- `packages/create-relkit/src/plan-manifest.types.ts`
- `packages/create-relkit/src/project-catalog.ts`
- `packages/create-relkit/src/scaffold-catalog.ts`
- `packages/create-relkit/src/scaffold-catalog.types.ts`
- `packages/create-relkit/tests/dependency-patch-generation.test.ts`
- `packages/create-relkit/tests/dependency-patches.fixture.ts`
- `packages/create-relkit/tests/dependency-patches.test.ts`
- `packages/create-relkit/tests/project-catalog.test.ts`
- `tests/generator/add-acceptance.test.ts`
- `tests/generator/option-matrix.test.ts`
- `tests/generator/scaffold-catalog.test.ts`

## Findings and resolution

1. Duplicate project/tooling catalog resolution did not fulfill the single
   strict resolver contract. The project adapter now delegates to the same
   catalog-resolution leaf as release tooling, retaining AddScaffoldError codes.
   Default/named/nested catalogs, missing entries, conflicting pins, and
   unresolved protocols are covered by deterministic tests.
2. Patch planning omitted transitive Drizzle owners. It now considers declared
   and requested testing/EffectMQ alongside direct Drizzle owners. Tests cover
   existing testing patch-only repair and adding EffectMQ without introducing
   an unsolicited direct Drizzle dependency or changing installedPackages.

No remaining functional finding was identified in the final foundation diff.
The patch asset is hash-verified from the package-owned source/packed location,
relative project registration is collision-safe, symlink assets reject, identical
files preserve modes, and unrelated patch entries remain. A patch-only change
requires installation and snapshots both lock formats; failure/cancellation
restores locks, manifest, assets, modes, and unrelated user content.

## Verification and review limits

Generator typecheck passed. The focused suite before the transitive correction
passed 73 tests; its extended replay passes all new cases, with one stale
full-service snapshot corrected to retain the portable patch declaration. The
snapshot diff adds only two existing manifest patch entries; it removes no
assertion. Final combined verification passed 85/85 across nine files in 41.73s:
package tests, manifest/catalog planning, transactions, cleanup, option matrix,
and real scaffold/compiler acceptance.
The separate clean packed PostgreSQL consumer passed actual registry installation
and strict native declaration probes; local links are not claimed as registry
coverage.

This foundation review preserves existing public Promise/synchronous boundaries,
errors, planning order, and transaction semantics. Pure catalog/type companions
are appropriately direct. Full discovery/planning/transaction/generation service
conversion, Ref state, scoped process ownership, TaggedError/Schema models, and
observable interruptible workflows remain explicit phase-three tasks; the
imperative foundation adapters are not claimed as final use-effect coverage.
All generated application authoring source retains RELKIT APIs.

# Generator phase-three implementation evidence

Author: `/root/plan_create_relkit`.
Status: author frozen; independent final review is recorded separately in
`phase-3-generator-review.md`. This evidence does not mark OpenSpec tasks complete.

## Complete TypeScript scope

`phase-3-generator-files.json` records every current authored package TypeScript
path, classification, retention reason, line count and SHA-256. The final inventory
contains 135 files: 122 source files, 12 tests/fixtures/compiler probes and one
Vitest configuration. All source implementation files are below the 250-line
limit; the largest is 242 lines. Installed dependencies and generated `dist`
output are excluded.

The baseline 57 authored source files were read through EOF before implementation.
New leaves and changed source were audited while splitting and implementing their
responsibilities. The independent reviewer read retained pure modules and the
Effect domain modules through EOF during rolling review and accepted all 135
final hashes. The obsolete staged creation addition loop
in `src/create-additions.ts` was removed. Supporting root generator regression
updates are `tests/generator/add-resolver.test.ts` and
`tests/generator/create-additions.test.ts`. The inventory separately classifies
the retired creation addition loop and its reason. The retained
`tests/generator/local-workspace.test.ts` terminal smoke now answers only the
final confirmation for an explicit name and rejects the retired artifact prompt.

## Behavioral contract

Creation defaults to the minimal template. Resolution asks only for a missing
project name. Generation owns exactly one final confirmation in interactive
mode, including when a name was supplied explicitly. All explicit template,
infrastructure, installation, Git, examples and directory flags remain supported.
Headless resolution and generation do not prompt. Optional jobs and directory
defaults retain their previous omitted/undefined public shape.

The staged artifact addition question loop is removed; `relkit add` retains its
separate consent and artifact support. Generated application source continues to
use the existing RELKIT authoring API. The public module is a pure export barrel,
and the executable is `dist/bin.js`. Importing the barrel cannot run a command,
and usage failure in JSON mode writes one JSON document without library logs.

Existing synchronous and Promise APIs remain boundary adapters. Public option,
result, plan, error constructor, code and formatting contracts remain intact.
Internal expected failures use Schema.TaggedError and map back to the original
public error identity. Unexpected transformation or runtime defects remain
Effect defects.

## Effect ownership and API selection

- GeneratorFileSystem, GeneratorProcess, GeneratorPaths and GeneratorPrompt use
  Context.Service and injectable live/fake Layers with explicit capability types.
  Discovery, scaffold planning, add resolution, generation and transactions have
  cohesive domain owners and narrow captured requirements.
- Planning and add resolution use private per-request Ref state. Duplicate file
  reservations and planned source transformations use atomic Ref updates. Public
  compatibility methods operate on that same authoritative state.
- Actual internal workflows compose typed Effects. Filesystem and process
  authority is visible; Promise runners are limited to public/native edges.
  Independent source reads use bounded concurrency of four. Ordered mutations
  stay sequential; process exit/stdout/stderr are concurrently owned children.
- Generation staging, atomic write temporary files and add snapshots/markers are
  acquired and released through Scope. Physical filesystem settlement and owned
  directory bookkeeping are masked together before cancellation can trigger
  rollback. The rename/publication handoff is atomic with its ownership state.
- Native processes kill and await owned children during interruption. Injected
  runners receive an AbortSignal, and scope release waits for physical settlement
  even if a runner ignores that signal. Lockfile rollback cannot race a late write.
- Rollback settles every file restoration. Secondary file/directory/temp/marker
  cleanup failures remain bounded diagnostic evidence alongside the original
  public primary error. Expected absent/nonempty directory outcomes are handled
  explicitly. Evidence is capped at 128, retaining the first and recent failures;
  it does not alter enumerable public error/result shapes.
- Schema validates owned manifest string records and prompt answers while
  preserving unrelated JSON fields and insertion order. Static option parsing,
  AST transformations, source builders and output rendering remain pure.
- Independently callable operations use named Effect.fn spans and the shared
  generator execution observer. Labels and workload dimensions are fixed and
  bounded; paths, process arguments, prompt values and rendered user source never
  become metric dimensions. Library edges use a quiet logger; executable progress
  and cleanup diagnostics use stderr.
- Cache and RcMap are not introduced: these finite operations do not hold reusable
  leases or a persistent memoized read lifecycle. Ref and Scope express the actual
  state/resource ownership without a hidden cache lifetime.

Portable central-catalog versions and the bundled Drizzle declaration patch from
phase two remain authoritative. Direct source and packed operation share the same
project manifest/patch preparation and transaction logic. Patch-only repair still
requires installation, snapshots both Bun lockfile forms, and rolls manifests,
assets and lockfiles back together.

## Source compatibility evidence

Effect and its companions are installed at stable 4.0.1. Relevant Context.Service,
Layer, Effect.fn/gen, acquireRelease/Scope, Ref, Schema, Logger, interruption and
concurrency implementations/documented examples were checked in installed
sources. The read-only `repos/effect` checkout was inspected for available
implementations, tests and usage examples; its missing core modules were recorded
as a vendor gap and resolved with installed 4.0.1 source rather than assumed
compatibility. Clack 1.7.0 native option types were checked for AbortSignal support.

## Verification at author freeze

All commands below ran from the isolated worktree:

```sh
rtk bun x tsc -b packages/create-relkit/tsconfig.json --pretty false
rtk bun x tsc -p packages/create-relkit/tsconfig.tests.json --pretty false
rtk bun x --bun vitest run --config packages/create-relkit/vitest.config.ts
rtk bun test tests/generator/plan-manifest.test.ts tests/generator/create-additions.test.ts tests/generator/add-resolver.test.ts packages/create-relkit/tests/dependency-patches.test.ts packages/create-relkit/tests/dependency-patch-generation.test.ts
rtk bun x prettier --check packages/create-relkit/src packages/create-relkit/tests packages/create-relkit/vitest.config.ts packages/create-relkit/tsconfig.tests.json tests/generator/add-resolver.test.ts tests/generator/create-additions.test.ts
```

Both strict compiler commands pass. The Effect suite passes 14 tests across six
files; the focused generator suite passes 57 tests across five files; formatting
passes. These checks include private state isolation, duplicate reservation,
unexpected defect propagation, multiple cleanup failures, native child
kill-and-await, injected late mutation and lockfile rollback, standalone
observation, JSON usage, passive barrel import, and prompt reduction.

The compiler test executes the strict test configuration and checks positive
fully supplied environments, non-any/non-never requirements and seven negative
missing-authority examples. Its intentional environment-erasure mutation produces
seven unused `@ts-expect-error` diagnostics, demonstrating that the probe detects
erased service requirements.

The complete `rtk bun run test:generator` gate passed after the selected CLI graph
was complete. It runs the strict service/test compiler, 14 Effect tests, four
acceptance compilation tests, five acceptance addition tests and 88 other native
generator tests: 111 tests passed with zero failures. The longest native group
took 56.2 seconds. This includes real local launcher create/add execution and the
shortened terminal confirmation flow. The previous transient missing-CLI-module
attempt is superseded by this completed integration gate.

## Final review corrections

The reviewer found a pre-existing root-parent path bug: slicing a missing child
relative to `/` could lose its first character. Canonicalization now uses
`basename(current)`. A controlled GeneratorPaths test Layer proves that
`/missing` and `/missing/nested` preserve complete segments when only `/` exists.
Both strict compiler checks and the updated 14-test Effect suite pass.

The final documentation pass replaced generic helper/service/type descriptions
with concrete inputs, result values and lifetime/completion contracts. Review also
corrected boolean-versus-artifact and shell-string-versus-argument-vector wording,
public Error class descriptions and one inherited `Object.prototype.constructor`
documentation lookup. No source runtime lookup used that documentation table.

The documentation-only proof reconstructs 429 actual JSDoc AST spans across 94
source files, using TypeScript parser ranges rather than regular-expression
comment stripping. Replacing only those spans with their previous comments
reproduces the complete original SHA-256 bytes. After explicitly accounting for
the accepted basename fix, it reports zero unexpected implementation changes.
The inventory retains pre-documentation hashes beside the final hashes for these
files and names the two accepted semantic paths: the validation leaf and its
controlled regression test. Source compilation and the final formatting check
pass after all comment corrections.

## Supporting launcher export

The contributor workspace launcher consumes `resolveCatalogVersion` and its
`CatalogManifest` type through the packed public generator API. The pure barrel
now explicitly re-exports that existing strict resolver and type, avoiding a
cross-workspace source import. This final two-line integration delta preserves
import passivity, was sent to the
coordinator for independent review, and passes the generator source compiler.
Its updated line count and SHA-256 are recorded in the coverage inventory.

The later cold-bootstrap integration exposes the same pure resolver through
`create-relkit/catalog-resolution`, shipping the resolver and its type companion
as source assets. Its leaf adds a type-only `CatalogManifest` re-export; the
resolver implementation is unchanged. The public barrel and source-subpath
exports are supporting integration changes, outside the earlier documentation
reconstruction proof. Their current hashes are included in the 135-file inventory,
and independent packed/cold-bootstrap verification is recorded in
`phase-4-catalog-bootstrap.md`.

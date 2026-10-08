# Final review coverage reconciliation: initial gaps

Auditor: `/root/plan_create_relkit`. Snapshot: 2026-10-05 20:21 UTC.
Status: metadata audit only; this report does not accept authored code or close
the package review gate. Final author formatting and new native regressions are
still producing deltas.

## Actual authored scope

An independent recursive Bun Glob scan included hidden TypeScript files and
excluded node_modules, dist, .turbo and .relkit trees. Current counts are **378
CLI TypeScript files** and **135 generator TypeScript files**. The generator
author inventory matches every current path and hash; its separate independent
review records the 135-file EOF acceptance. The retired baseline
create-additions.ts is explicitly classified in the author inventory with the
approved removal of the staged creation question loop.

The CLI Markdown matrix has 376 distinct current rows, no duplicate or obsolete
paths. It omits two newly authored files:

- packages/cli/src/commands/dev-session-owner.ts, in the client/local/deploy/dev
  domain slice;
- packages/cli/tests/services/process.test.ts, in shared native capabilities.

The matrix needs its count changed to 378 and added count changed from 226 to
228, while retaining the 150-file baseline. It also needs two classification
corrections: the read-commands/ports group was independently reviewed by
native_gate, not the generator author; bin.ts is an executable Effect/native
boundary, not a pure parser/render/barrel.

## Independent current-byte anchors

Only reviewer-owned accepted snapshots whose recorded SHA matches current
bytes count below. An author snapshot naming an intended reviewer is not an
independent acceptance receipt.

| Evidence | Rows | Current hash mismatches | Meaning |
| --- | ---: | ---: | --- |
| phase-4-native-review-files.json | 80 | 0 | Root acceptance of doctor31, parser11, emitted runtime28, supporting tests2 and bootstrap8. |
| phase-3-contributor-review-files.json | 18 | 0 | Root acceptance of the native contributor slice, including its root generator acceptance test. |
| phase-3-cli-baseline-review-files.json | 37 | 0 | Independent baseline test/fixture acceptance. |
| phase-3-telemetry-review-files.json | 19 | 0 | Independent telemetry EOF acceptance with actual controlled/native checks. |
| phase-3-invocation-jobs-review-files.json | 48 | 3 | Three fresh formatting/presentation deltas need the reviewer's refreshed receipt. |
| phase-3-cli-domain-rolling-files.json | 91 | 79 | Explicitly open rolling source review; final formatted domain/test acceptance is pending. |
| phase-2-files.json | 66 | 31 | Historical accepted foundation bytes, superseded by later scoped work. |

There are **188 distinct CLI files with current accepted independent JSON
anchors** at this snapshot. The remaining 190 comprise 53 existing shared-group
rows, 102 domain rows including the new owner, 34 already EOF-reviewed help/read
rows needing final hash anchors, and the new process test. These are coverage
receipt gaps and pending scoped review; the count does not negate earlier EOF
reads or claim a product failure.

The invocation deltas are cli-runtime.ts, cli-cleanup-presentation.ts and
tests/services/cleanup-receipts.test.ts. The reviewer has reread them through EOF;
the affected receipt regression and final hash refresh remain to be recorded.
The shared54 EOF review is explicit and functionally accepted by root, but its
final byte matrix is pending the author freeze and needs to account for the new
process test. Native domain review remains open and must include every new
owner and corresponding test/fixture, not just its rolling91 source rows.

Read-services21 and help/editor13 have explicit independent EOF Markdown
receipts and actual tests, but no immutable final SHA matrices yet. The auditor
has requested current reviewer-owned anchors from native_gate. Their 34 CLI
paths must not be reassigned to this auditor merely to fill the matrix.

## Historical and supporting evidence

The 31 foundation hash changes are expected later work. Twelve CLI paths have
current parser/doctor/contributor overlays; cli-effect-runtime.ts awaits the
shared-service freeze. Five changed release/catalog/test paths are anchored in
root's current bootstrap8 receipt. Twelve changed generator paths have later
native EOF or root bootstrap review. The remaining generator index.ts public
resolver/type exports need an explicit current independent supporting receipt;
its author manifest alone does not provide that receipt. Root has been sent the
current index SHA to record, and the export is explicitly excluded from the
earlier documentation-only AST equivalence proof.

The root native80 acceptance is current and independent. The separate
native-authored80, contributor-authored18 and doctor-authored31 files remain
author records and should link their accepted counterparts. The doctor author
status still says root review pending, though root's final31 acceptance exists.
The doctor Markdown preserves its original30-byte snapshot and explicitly links
the accepted final31 overlay, so its historical hashes are not refreshed as if
they were new independent reads. Its new compatibility test checks stale built
version and ordered reads; inherited-stream ownership is verified by the native
product-runtime replay, not by that controlled compatibility test itself.

Supporting changes outside the package scopes still need a final union against
the foundation66/bootstrap and other explicit EOF records. No nonexistent test
path, generated source, mutable author record or repeated test execution counts
as additional independently reviewed authored coverage.

## Closure actions

1. Authors finish their final source/test/documentation freeze.
2. Existing independent owners record shared and domain final matrices, and
   anchor already reviewed help/read files at their accepted bytes.
3. This reviewer records the three invocation delta checks and refreshed hashes.
4. The coordinator records the generator public export receipt, corrects CLI
   matrix ownership/classification/counts, and reconciles all supporting deltas.
5. Rerun this metadata audit against the final inventory; preserve historical
   foundation snapshots and report current overlays instead of rewriting them.

## Receipts supplied after this initial snapshot

Native_gate supplied current accepted SHA matrices for read-services21 and
help/editor17 (13 CLI and four supporting files). Independent hash verification
found zero mismatches. The three invocation deltas were reread through EOF,
the six receipt regressions passed in 1.74 seconds, and all nine actual invocation/
jobs/receipt bodies strictly compiled with zero diagnostics. The reviewer-owned
48-file receipt is refreshed. These additions raise current distinct CLI byte
anchors from 188 to 225; final shared/domain matrices and inventory corrections
remain pending and this initial report does not close their review.

The final frozen reconciliation at phase-4-review-coverage.md and its pinned JSON
now supersedes this initial gap snapshot: all 513 current package paths, all 207
baseline dispositions and the 45 supporting TypeScript paths are accounted for,
with zero accepted-hash or reviewer-ownership mismatches. Historical receipts
remain preserved. The auditor has frozen evidence writes for coordinator checks.

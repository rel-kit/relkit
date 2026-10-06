# Independent shared CLI service review

Reviewer: root. Author: plan_cli. All 55 shared project, execution, capability,
cleanup and test TypeScript files were read through EOF. Review is closed at the
current frozen hashes in `phase-3-cli-shared-review-files.json`. Combined acceptance
remains a phase-five gate.

Context services capture only their declared filesystem/compiler/process/module
and cleanup authorities. Live and deterministic test Layers substitute at the
same boundary. Strict missing-service, missing-Scope and requirement-erasure
probes retain useful environments. Schema owns untrusted module markers and
manifest fields; native namespace identity and live bindings remain intact.
Public Promise/synchronous adapters preserve original errors, JSON and results.

Each invocation owns a ManagedRuntime, one cleanup ledger and a scoped domain
program. Native mutations physically settle inside their required atomic section;
compiler/process groups retain cancellation and finite reap authority. Build
publication preserves ordering, complete-cohort activation and the original
publication failure beside separate rollback evidence. Exclusive temporary-file
creation acquires deletion authority only after successful open; collisions
preserve pre-existing files, and partial writes close and roll back their own path.

Success-only module reuse stays session-local. Ref replaces the Cache instance
on invalidation so an older pending load cannot overwrite a newer accepted value.
Concurrent sharing, last-consumer interruption, invalidation and recovery are
covered. Failures remain uncached. Imported namespaces are values rather than
acquired resources, so RcMap adds no useful lifetime guarantee here.

Every independently callable domain/capability operation uses shared execution
observation and bounded labels. Configured logging is acquired at the edge;
compatibility runners do not count the operation again. Object, primitive and
error outcomes preserve primary identity/status/stdout while the owning terminal
can emit canonical redacted v2 cleanup evidence. WeakMap result receipts and the
private Ref ledger retain the first and 127 recent causes; original object-owned
receipts are presented alongside ledger evidence without enumerable mutation.

All seven rolling findings are resolved: standalone observation, namespace
identity/companions, callable documentation, shared runners, rollback evidence,
public jobs-manifest errors and interrupted/invalidated cache recovery. The later
exclusive-write primitive-failure finding is also resolved through the invocation
ledger, rather than attempting to attach WeakMap metadata to a primitive.

## Actual independent verification

- Eight shared service test files: 26 tests passed, 12.73 seconds;
  `/tmp/relkit-effect-final-shared-tests.log`.
- All nine actual test/fixture bodies strictly compiled with no diagnostics,
  `skipLibCheck:false`, exact optional properties and indexed-access checking.
- The later native process test brings strict actual-body coverage to ten files,
  again with zero diagnostics. Three actual process cases passed independently
  under both Node and Bun: complete UTF-8 stdout/stderr with exit seven, bounded
  output preserving its primary size error, and interruption-only termination
  of both parent and descendant with no secondary cleanup failure.
- A real pending Node pipe read exposed a cancellation deadlock before the fix.
  The owned iterator now destroys its pipe before awaiting iterator return, so
  physical reader settlement precedes outer process-group reaping. The new
  real-process tests retain this regression; previous owned failed-test groups
  were reaped after receipt and command verification.
- The four exclusive-file tests passed independently before the combined gate,
  including collision, partial write/close/unlink failures and primitive failure
  with redacted terminal receipts.
- Captured Context and ManagedRuntime runner compiler probes passed positive
  calls and four negative missing-authority calls, synchronous and asynchronous.
- The final SourceWatch authority/composition consumer additions were read through
  EOF and their two real strict/erasure compiler tests reran successfully in
  8.32 seconds (`/tmp/relkit-effect-final-service-probes.log`).
- The author and independent generator reviewer additionally replayed actual
  build/command/native acceptance and bounded terminal receipt regressions.

Installed stable Effect 4.0.1 Cache/Scope/Context/Ref/ManagedRuntime/Effect source,
embedded examples and exact upstream tests provided compatibility evidence where
the partial read-only vendor checkout lacks the corresponding implementation or
test. Source provenance is shared with the phase-four runtime review. No vendor
files were edited or installed.

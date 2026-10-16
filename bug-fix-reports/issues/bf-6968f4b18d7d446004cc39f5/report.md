# bf-6968f4b18d7d446004cc39f5: Prepared eligibility admits eager ambient code disguised as asTool

Status: **verified**
Attempt: 1 · Updated: 2026-10-16T15:48:06+00:00

## What

Prepared eligibility admits eager ambient code disguised as asTool

## Expected

Preparation rejects ambient descriptor construction and publishes no pointer

## Observed before

Native dev --prepare published a snapshot from an untracked environment-dependent application id

## Root cause

snapshot-eligibility.ts:108 marks arbitrary function declarations local; snapshot-eligibility-expressions.ts treated all local asTool methods as audited constructors

## Fixed by

Verified explicit function-descriptor provenance through captured backend imports, fail-closed ambiguous/cyclic imports, and static destructuring keys. Same native CLI regression changes from wrongful publication to eligibility rejection; genuine imported tools still prepare. Final recovery32/32, six lifetime cases, and all32 local framework gates pass.

## Changed files

- packages/cli/src/dev-snapshot/snapshot-eligibility.ts
- packages/cli/src/dev-snapshot/snapshot-eligibility-expressions.ts
- packages/cli/src/dev-snapshot/snapshot-function-bindings.ts
- packages/cli/src/dev-snapshot/snapshot-preparation-guards.ts
- packages/cli/tests/dev-snapshot/as-tool-integrity.test.ts
- packages/cli/tests/dev-snapshot/eligibility.test.ts

## Reproduction

- Run the recorded focused regression on the baseline and retain its actual assertion failure
- Run the recorded actual native integration before/after commands against isolated equivalent fixtures
- Replay ordinary/prepared commerce recovery matrices, native lifetime cases and complete serial local framework checks

## Evidence

- before: [integration](evidence/001/runtime-before.txt) — Native CLI wrongly publishes ambient-dependent topology
- before: [unit](evidence/001/unit-before.txt) — Focused regression fails
- after: [unit](evidence/001/unit-after-final.txt) — Four regressions include real and forged descriptors, cycles, ambiguous resolution, and computed bindings
- after: [integration](evidence/001/runtime-after.txt) — Actual CLI rejects the ambient asTool source before publication
- after: [integration](evidence/001/runtime-valid-tool.txt) — Actual CLI prepares an imported genuine function descriptor
- after: [integration](evidence/001/adjacent-vitest.txt) — Nine adjacent guard and typed environment-error checks pass
- after: [integration](evidence/001/runtime-after-final.txt) — Final source native rejection replay
- after: [integration](evidence/001/runtime-computed-after.txt) — Final source computed-key rejection
- after: [integration](evidence/001/runtime-valid-tool-final.txt) — Final source genuine tool preparation
- after: [integration](evidence/001/recovery-final-summary.json) — Final source ordinary/prepared16-case matrices pass32 cases
- after: [check](evidence/001/full-framework-summary.json) — All32 local gates, fresh793-mutant run and retained timeout/retry evidence
- after: [integration](evidence/001/existing-preview-final.json) — Unchanged approved preview, authenticated business state and full capsule validation

## Scope

```json
{
  "modules": [
    "SnapshotEligibility",
    "SnapshotPreparation",
    "TypeScript AST admission"
  ],
  "entrypoints": [
    "relkit dev --prepare"
  ],
  "invariants": [
    "Eager asTool construction requires a proven defineFunction descriptor",
    "Computed binding keys cannot execute unaudited code",
    "Source/dependency/artifact/graph and containment guards remain enforced"
  ]
}
```

## Environment

```json
{
  "package": "packages/cli",
  "revision": "ebc3a2544ad5521016fd9efc8db3ff1930a3fb75 plus uncommitted fixes; exact final scoped hashes in evidence/001/fix-source-sha256.json and complete7217-input audit",
  "target": "Actual native CLI fixtures, isolated commerce copies, and preserved preview http://127.0.0.1:3400",
  "api_exposed": false,
  "e2e_available": true,
  "monitoring": "Existing CLI observeCli structured operation logs retained. No new monitoring installed. Native subprocess and HTTP readback provide behavioral evidence."
}
```

## Verification

```json
{
  "unit": {
    "before": {
      "status": "failed",
      "command": "bun test --max-concurrency 1 packages/cli/tests/dev-snapshot/as-tool-integrity.test.ts",
      "cwd": ".",
      "exit_code": 1,
      "assertion": "Ambient local asTool construction must be rejected",
      "output": "evidence/001/unit-before.txt"
    },
    "after": {
      "status": "passed",
      "command": "bun test --max-concurrency 1 packages/cli/tests/dev-snapshot/as-tool-integrity.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Reject forged local/imported descriptors, namespaces, cycles, ambiguous imports and computed keys; accept proven genuine descriptors",
      "output": "evidence/001/unit-after-final.txt"
    }
  },
  "runtime": {
    "kind": "integration",
    "reason": "Prepared source admission is a CLI workflow with no public HTTP operation; the actual native dev --prepare composition is exercised",
    "boundary": "Actual CLI -> source inventory and static guards -> compiler/bundler -> snapshot publication",
    "dependencies": [
      "Actual CLI, TypeScript, Effect and native filesystem/process adapters",
      "Copied physical installed framework dependencies and synthetic generated minimal app; no mocked compiler"
    ],
    "steps": [
      "Materialize the synthetic owned app with an ambient function disguised as asTool",
      "Run actual dev --prepare",
      "Assert nonzero eligibility rejection and no current pointer publication"
    ],
    "before": {
      "status": "failed",
      "command": "python3 bug-fix-reports/issues/bf-6968f4b18d7d446004cc39f5/evidence/001/native-prepare.py",
      "cwd": ".",
      "exit_code": 1,
      "assertion": "Native CLI must reject eager ambient construction before publication; baseline wrongly published a snapshot",
      "output": "evidence/001/runtime-before.txt"
    },
    "after": {
      "status": "passed",
      "command": "python3 bug-fix-reports/issues/bf-6968f4b18d7d446004cc39f5/evidence/001/native-prepare.py",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Native CLI rejects the same ambient construction and publishes no pointer",
      "output": "evidence/001/runtime-after-final.txt"
    }
  },
  "e2e": {
    "status": "passed",
    "command": "python3 bug-fix-reports/issues/bf-6968f4b18d7d446004cc39f5/evidence/001/native-prepare.py --valid-tool",
    "cwd": ".",
    "exit_code": 0,
    "assertion": "Actual native CLI still prepares an imported genuine function descriptor",
    "output": "evidence/001/runtime-valid-tool-final.txt"
  },
  "checks": [
    {
      "name": "all32 local framework stages and source/process audit",
      "status": "passed",
      "command": "python3 test-results/full-suite-integrity-fixes-20261016/finish.py",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "All32 latest stage results pass; all7217 authored inputs match; HEAD unchanged and staging empty; completed suite ownership records contain no live owned process",
      "output": "evidence/001/full-framework-audit.txt"
    },
    {
      "name": "full workspace build",
      "status": "passed",
      "command": "bun run build",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Every workspace build task succeeds",
      "output": "evidence/001/framework-build.txt"
    },
    {
      "name": "root typecheck and commerce CLI check",
      "status": "passed",
      "command": "bun run typecheck",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Root TypeScript and actual canonical commerce check succeed",
      "output": "evidence/001/framework-typecheck.txt"
    }
  ],
  "regressions": [
    {
      "kind": "integration",
      "boundary": "Actual ordinary/prepared commerce CLI -> stable HTTP proxy -> last-known-good traffic and repaired activation",
      "status": "passed",
      "command": "RELKIT_RECOVERY_MODES=prepared RELKIT_RECOVERY_EVIDENCE=test-results/integrity-fixes-20261016/final-prepared-retry python3 test-results/integrity-fixes-20261016/recovery.py",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "All16 recovery assertions pass on unchanged prepared CLI59668; combined final ordinary/prepared summary contains32 passing cases",
      "output": "evidence/001/prepared-recovery.txt"
    },
    {
      "kind": "integration",
      "boundary": "Native prepared/ordinary invocation cancellation -> owned child cleanup",
      "status": "passed",
      "command": "python3 test-results/dev-process-lifetime-20261016/probe.py hup --prepared --expect-graceful",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Actual prepared SIGHUP exits129 with diagnostics, no surviving descendants, and verified cleanup",
      "output": "evidence/001/prepared-hup-result.json"
    },
    {
      "kind": "integration",
      "boundary": "Existing approved commerce preview -> authenticated session/cart/order -> independent SQLite readback and full snapshot validation",
      "status": "passed",
      "command": "bun test-results/integrity-fixes-20261016/final-live.probe.ts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Original CLI69188 remains live; complete capsule validates before/after authenticated reads; cart7200 and historical order4900 match SQLite",
      "output": "evidence/001/existing-preview-final.json"
    },
    {
      "kind": "integration",
      "boundary": "Native CLI -> strict computed binding admission",
      "status": "passed",
      "command": "python3 bug-fix-reports/issues/bf-6968f4b18d7d446004cc39f5/evidence/001/native-prepare.py --computed-binding",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Actual CLI rejects eager computed destructuring before snapshot publication",
      "output": "evidence/001/runtime-computed-after.txt"
    }
  ],
  "limitations": [
    "Local Mac/Bun1.3.10/Effect4.0.1 proof only; hosted CI and opt-in real AWS/Docker acceptance were not run",
    "First packed-export guardrail subprocess timed out; the identical28 tests passed on a scoped cache-disabled retry with unchanged checks/deadlines; exact runtime stall cause remains unconfirmed"
  ]
}
```

## Related reports

```json
[
  "bf-66e347f46c30cffca371d589"
]
```

## Notes

```json
[
  "All changes remain uncommitted; HEAD unchanged and staging empty. No source/dependency/artifact/graph integrity guard or test deadline was relaxed.",
  "Mac responsiveness took priority: resource-warning recovery stopped and resumed only with normal pressure; all deferred/interrupted evidence retained.",
  "The approved existing preview CLI69188 was not stopped or restarted. All newly owned test processes and fixture roots were cleaned.",
  "Default local framework scope completed; opt-in real AWS/Docker acceptance and hosted CI were not run. Framework browser results: inspector31 passed; commerce2 passed/1 declared skip; main package Vitest2777 passed/5 declared skips.",
  "First packed-export guardrail attempt reached the existing540000ms deadline. Import/inventory probes succeeded; identical28 tests passed with BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 scoped to retry. Exact runtime stall cause is unconfirmed; no global cache or system settings changed.",
  "The timed-out packed-export fixture was atomically moved from temporary storage into test-results/full-suite-integrity-fixes-20261016/guardrail-timeout-fixture as retained diagnostic evidence; no live process uses it."
]
```

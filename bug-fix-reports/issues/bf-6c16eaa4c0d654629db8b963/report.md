# bf-6c16eaa4c0d654629db8b963: The full integration suite could not compare flat and grouped commerce layouts because flat fixture preparation rejected absent destination directories.

Status: **verified**
Attempt: 1 · Updated: 2026-10-15T21:07:51+00:00

## What

The full integration suite could not compare flat and grouped commerce layouts because flat fixture preparation rejected absent destination directories.

## Expected

Create absent or empty private destinations, preserve complete service bytes, and reject every authored collision before rewriting any imports.

## Observed before

A missing glob cwd caused ENOENT; hidden destination files escaped the guard, and collision validation happened after import rewriting.

## Root cause

flattenCommerce in tests/integration/fixtures/paired-commerce-project.ts scanned destinations before creating them, used Bun.Glob's default dotfile exclusion, and performed that validation after the source rewrite pass.

## Fixed by

Preflight every service destination before rewriting: create absent directories, include dotfiles in residue detection, and reject authored collisions. Five filesystem regressions and both maintained native commerce acceptance layouts pass.

## Changed files

- tests/integration/fixtures/paired-commerce-project.ts
- tests/unit/paired-commerce-project.test.ts

## Reproduction

- Run bun run test:integration: flat fixture raises ENOENT at src/database, and grouped comparison has no flat baseline.
- Repeat bun test tests/integration/paired-commerce-layout.test.ts: same two failures.
- Run the focused filesystem regressions: missing destinations and hidden-file rejection fail before the first fix.
- After that fix, add the collision-import preservation regression: it reproduces mutation before rejection.
- Validate destinations before rewriting, replay all five focused cases, then rerun the complete integration suite.

## Evidence

- before: [integration](evidence/001/integration-before.log) — Full integration suite: two failures.
- before: [integration](evidence/001/runtime-before.log) — Isolated real native paired layout acceptance reproduces ENOENT.
- before: [unit](evidence/001/unit-before.log) — Missing destination and hidden collision fail against original implementation.
- before: [unit](evidence/001/collision-before.log) — Additional failing cycle: rejected destination imports were rewritten.
- after: [unit](evidence/001/unit-after.log) — All five focused filesystem cases pass.
- after: [integration](evidence/001/integration-after.log) — All 60 integration tests pass; three existing Docker skips.
- after: [integration](evidence/001/suite/summary.json) — Every local full-suite stage plus final checks passed.

## Scope

```json
{
  "modules": [
    "flattenCommerce",
    "PairedCommerce",
    "native commerce acceptance"
  ],
  "entrypoints": [
    "bun run test:integration",
    "bun test tests/unit/paired-commerce-project.test.ts"
  ],
  "invariants": [
    "Absent and empty destinations accept whole-service moves.",
    "Hidden and visible collisions remain byte-identical on rejection.",
    "Flat and grouped native graphs preserve the same logical contracts while physical hashes differ."
  ]
}
```

## Environment

```json
{
  "package": "tests/integration/fixtures",
  "revision": "ebc3a2544 plus uncommitted recovery and suite fixes",
  "target": "macOS Bun 1.3.10; private native fixture trees; all children joined and removed",
  "api_exposed": false,
  "e2e_available": true,
  "monitoring": "Existing observeExecution fixture/compiler logs and assertion-bearing native acceptance output. No remote monitoring is needed for the private fixture operation."
}
```

## Verification

```json
{
  "unit": {
    "before": {
      "status": "failed",
      "command": "bun test tests/unit/paired-commerce-project.test.ts",
      "cwd": ".",
      "exit_code": 1,
      "assertion": "Missing destinations are accepted and hidden collisions rejected without loss.",
      "output": "evidence/001/unit-before.log"
    },
    "after": {
      "status": "passed",
      "command": "bun test tests/unit/paired-commerce-project.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "All five cases pass: absent, empty, visible collision, hidden collision, and no rewriting before rejection.",
      "output": "evidence/001/unit-after.log"
    }
  },
  "runtime": {
    "kind": "integration",
    "reason": "The owning defect is private CLI test-fixture preparation, with no HTTP API for creating the fixture.",
    "boundary": "PairedCommerce -> copy actual commerce tree -> flatten private files -> real CLI compiler -> maintained native HTTP/agent/event/task acceptance",
    "dependencies": [
      "Actual Bun filesystem and compiler",
      "Actual commerce descriptors and maintained acceptance tests",
      "Installed workspace SDK links; no cloud resources"
    ],
    "steps": [
      "Copy native commerce sources into an owned temporary repository.",
      "Prepare flat then grouped fixtures.",
      "Run real CLI check and native acceptance for each.",
      "Compare logical contracts, preserve distinct physical hashes, and remove owned source/process resources."
    ],
    "before": {
      "status": "failed",
      "command": "bun test tests/integration/paired-commerce-layout.test.ts",
      "cwd": ".",
      "exit_code": 1,
      "assertion": "Both native layouts must finish and compare without restarting the harness.",
      "output": "evidence/001/runtime-before.log"
    },
    "after": {
      "status": "passed",
      "command": "bun run test:integration",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Both formerly failing layout cases and all other integration cases pass.",
      "output": "evidence/001/integration-after.log"
    }
  },
  "e2e": {
    "status": "passed",
    "command": "bun run test:integration",
    "cwd": ".",
    "exit_code": 0,
    "assertion": "Both real compiled commerce layouts pass maintained HTTP, agent, cache, event, task, and graph contract assertions.",
    "output": "evidence/001/integration-after.log"
  },
  "regressions": [
    {
      "kind": "integration",
      "boundary": "Native filesystem collision rejection",
      "status": "passed",
      "command": "bun test tests/unit/paired-commerce-project.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Hidden and visible authored bytes survive rejection; no module rewrite happens before rejection.",
      "output": "evidence/001/unit-after.log"
    },
    {
      "kind": "integration",
      "boundary": "Paired native commerce compiler and consumers",
      "status": "passed",
      "command": "bun run test:integration",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Both layout variants retain logical graphs and maintained native acceptance behavior.",
      "output": "evidence/001/integration-after.log"
    }
  ],
  "checks": [
    {
      "name": "final workspace build",
      "status": "passed",
      "command": "bun run build",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/suite/23-final-build.log"
    },
    {
      "name": "updated full unit suite",
      "status": "passed",
      "command": "bun run test:unit",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/suite/24-final-unit.log"
    },
    {
      "name": "prepared startup certification",
      "status": "passed",
      "command": "bun test scripts/tests/dev-readiness/bootstrap-imports.test.ts scripts/tests/packed-manifest.test.ts scripts/tests/registry-cache.test.ts scripts/tests/release-command.test.ts packages/cli/tests/dev-snapshot/input-watch.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/suite/25-certification-bun.log"
    },
    {
      "name": "packed startup certification",
      "status": "passed",
      "command": "bun x vitest run --maxWorkers=1 scripts/tests/benchmark-packed-cleanup.test.ts scripts/tests/benchmark-packed-dev.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/suite/26-certification-vitest.log"
    },
    {
      "name": "repository guardrails and root typecheck",
      "status": "passed",
      "command": "bun test tests/phase0.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/suite/27-guardrails.log"
    },
    {
      "name": "lint",
      "status": "passed",
      "command": "bun run lint",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/suite/28-lint.log"
    },
    {
      "name": "boundaries",
      "status": "passed",
      "command": "bun run check",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/suite/29-boundaries.log"
    },
    {
      "name": "structure configuration",
      "status": "passed",
      "command": "bun run konsistent -- validate",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/suite/30-konsistent.log"
    },
    {
      "name": "changed file formatting",
      "status": "passed",
      "command": "bun x prettier --check tests/integration/fixtures/paired-commerce-project.ts tests/unit/paired-commerce-project.test.ts packages/cli/src/commands/dev-session-engine.ts packages/cli/src/commands/dev-session.types.ts packages/cli/src/commands/dev-watch.ts packages/cli/tests/services/dev-support-fixture.ts packages/cli/tests/services/source-watch-synchronous.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/suite/31-format.log"
    },
    {
      "name": "observability sinks",
      "status": "passed",
      "command": "bun scripts/check-observability-sinks.ts",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/suite/32-observability.log"
    },
    {
      "name": "full serial local suite",
      "status": "passed",
      "command": "Every local stage from scripts/test-all.ts with serial orchestration and bounded nested workers",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/suite/summary.json"
    },
    {
      "name": "owned process and listener cleanup",
      "status": "passed",
      "command": "Python process inventory and lsof listener audit",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/suite/process-audit.json"
    }
  ],
  "limitations": [
    "Local macOS/Bun 1.3.10 verification. Optional Docker/cloud/provider and platform-gated tests retain their declared skips; hosted CI was not run.",
    "The fix is confined to private acceptance fixture preparation; it does not change production layout migration semantics."
  ]
}
```

## Related reports

```json
[
  "bf-a561f569dacbef352f9ffb95"
]
```

## Notes

```json
[]
```

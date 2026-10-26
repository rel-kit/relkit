# bf-69a0816c76bbbeb07fb51753: Contributor relkit create fails to publish a minimal project with no jobs.

Status: **verified**
Attempt: 1 · Updated: 2026-10-25T18:53:00+00:00

## What

Contributor relkit create fails to publish a minimal project with no jobs.

## Expected

Install workspace links, fully validate the application, and publish a runnable project.

## Observed before

The interactive shell uses scripts/relkit-local.ts. Snapshot preparation rejects external workspace declarations with TypecheckInputError reason escaped, reported as RELKIT_CREATE_PREPARE_FAILED.

## Root cause

packages/cli/src/local.ts forwarded generator-owned dev --prepare after installing mutable workspace links. packages/compiler/src/typecheck-inputs-native.ts:55-60 intentionally excludes externally linked declarations from portable snapshot evidence and requires ordinary checking.

## Fixed by

The contributor adapter selects the existing full check for generator-owned dev --prepare while preserving project-root arguments, exit failures, cancellation, and cleanup. The interactive regression and original contributor wrapper now succeed. 20 focused tests, typechecking, formatting, boundaries, and live HTTP checks pass.

## Changed files

- packages/cli/src/local.ts
- tests/generator/local-workspace.test.ts

## Reproduction

- Resolve interactive zsh function to contributor launcher
- Create minimal/no-jobs project with installation enabled in a fresh external destination
- Observe failure after links are installed
- Inspect retained linked project preparation and run interactive regression
- Replay same wrapper command and test generated runtime over HTTP

## Evidence

- before: [integration](evidence/001/runtime-before.txt) — Reported failure at the actual contributor entrypoint
- before: [unit](evidence/001/regression-before.txt) — Focused native regression failed before the fix
- before: [integration](evidence/001/cause.txt) — Preparation rejects escaped declarations
- after: [integration](evidence/001/runtime-after.txt) — Same contributor command succeeds
- after: [unit](evidence/001/regression-final.txt) — Interactive regression passes
- after: [e2e](evidence/001/regressions-after.txt) — 20 focused tests pass
- after: [integration](evidence/001/relkit-wrapper-probe-20261025-http-verified.txt) — Linked application HTTP proof
- after: [integration](evidence/001/relkit-demo-7-http-verified.txt) — Requested demo HTTP proof

## Scope

```json
{
  "modules": [
    "contributor runner",
    "project generation",
    "source checking",
    "snapshot eligibility"
  ],
  "entrypoints": [
    "relkit shell function",
    "scripts/relkit-local.ts create",
    "generated bun run dev"
  ],
  "invariants": [
    "Workspace links stay live",
    "Full checking precedes publication",
    "Snapshot containment is unchanged",
    "Failed stages are cleaned",
    "Installed CLI still prepares snapshots"
  ]
}
```

## Environment

```json
{
  "package": "packages/cli",
  "revision": "031513a549f3e61f91920ddc0eac8feccb56c059 plus scoped uncommitted changes",
  "target": "macOS arm64; Bun 1.3.10; Effect 4.0.1; external temporary projects",
  "api_exposed": false,
  "e2e_available": true,
  "monitoring": "Existing observeCli/observeExecution and native child output. Direct real preparation inspection recovered TypecheckInputError escaped. No remote monitoring was needed."
}
```

## Verification

```json
{
  "unit": {
    "before": {
      "status": "failed",
      "command": "bun test tests/generator/local-workspace.test.ts --test-name-pattern \"local create installs workspace links\"",
      "cwd": ".",
      "exit_code": 1,
      "assertion": "Creation exits zero and publishes a checked linked application",
      "output": "evidence/001/regression-before.txt"
    },
    "after": {
      "status": "passed",
      "command": "bun test tests/generator/local-workspace.test.ts --test-name-pattern \"local create installs workspace links\"",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Creation succeeds with workspace links and compiler graph",
      "output": "evidence/001/regression-final.txt"
    }
  },
  "runtime": {
    "kind": "integration",
    "reason": "Creation is a CLI workflow; HTTP separately verifies the generated app.",
    "boundary": "contributor wrapper -> workspace installation -> verification -> publication",
    "dependencies": [
      "Actual CLI and generator",
      "Bun link/install",
      "Real compiler and external filesystem"
    ],
    "steps": [
      "Create with the same minimal/no-jobs options",
      "Assert publication, linked dependency, and generated graph"
    ],
    "before": {
      "status": "failed",
      "command": "python3 assertion harness invoking bun scripts/relkit-local.ts create relkit-wrapper-probe-20261025 --template minimal --cloud none --deploy none --no-git --json with child cwd /Users/mustafaelsayed/Workspace/typescripts",
      "cwd": ".",
      "exit_code": 1,
      "assertion": "Contributor creation must publish a checked linked application",
      "output": "evidence/001/runtime-before.txt"
    },
    "after": {
      "status": "passed",
      "command": "python3 assertion harness invoking bun scripts/relkit-local.ts create relkit-wrapper-probe-20261025 --template minimal --cloud none --deploy none --no-git --json with child cwd /Users/mustafaelsayed/Workspace/typescripts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Successful publication, workspace link, and complete compiler graph",
      "output": "evidence/001/runtime-after.txt"
    }
  },
  "e2e": {
    "status": "passed",
    "command": "bun test tests/generator/local-workspace.test.ts tests/generator/local-workspace-native.test.ts packages/create-relkit/tests/generation-preparation.test.ts tests/generator/failure-cleanup.test.ts",
    "cwd": ".",
    "exit_code": 0,
    "assertion": "20 tests pass including interactive creation, native links, add verification, rollback, and standard preparation",
    "output": "evidence/001/regressions-after.txt"
  },
  "checks": [
    {
      "name": "CLI TypeScript build",
      "status": "passed",
      "command": "bun x tsc -b packages/cli --pretty false",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "No compiler diagnostics",
      "output": "evidence/001/typecheck.txt"
    },
    {
      "name": "Repository boundaries",
      "status": "passed",
      "command": "bun run check",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "65 roots and 5665 files passed",
      "output": "evidence/001/check.txt"
    },
    {
      "name": "Formatting",
      "status": "passed",
      "command": "bun x prettier --check packages/cli/src/local.ts tests/generator/local-workspace.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Both changed sources passed",
      "output": "evidence/001/format.txt"
    },
    {
      "name": "Generated demo",
      "status": "passed",
      "command": "bun run typecheck && bun run test (child cwd /Users/mustafaelsayed/Workspace/typescripts/relkit-demo-7)",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Demo typecheck and both generated tests passed",
      "output": "evidence/001/demo-checks.txt"
    }
  ],
  "regressions": [
    {
      "kind": "integration",
      "boundary": "workspace-linked app -> real HTTP routing and input validation",
      "status": "passed",
      "command": "python3 HTTP assertion harness spawning bun run dev with an ephemeral port in /Users/mustafaelsayed/Workspace/typescripts/relkit-wrapper-probe-20261025",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Exact Hello, RelKit! greeting; empty name rejected with HTTP 422; owned process stopped",
      "output": "evidence/001/relkit-wrapper-probe-20261025-http-verified.txt"
    },
    {
      "kind": "integration",
      "boundary": "standard installed demo -> real HTTP routing and validation",
      "status": "passed",
      "command": "python3 HTTP assertion harness spawning bun run dev with an ephemeral port in /Users/mustafaelsayed/Workspace/typescripts/relkit-demo-7",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Exact greeting, HTTP 422 validation, and owned process shutdown",
      "output": "evidence/001/relkit-demo-7-http-verified.txt"
    }
  ],
  "limitations": [
    "Full repository suite, hosted CI, Docker/cloud, and publishing were not run.",
    "Contributor apps use full validation instead of portable snapshots and retain its startup cost.",
    "The focused regression uses the existing native CLI harness rather than mocked command internals.",
    "The requested demo uses published dependencies; separate disposable linked projects proved the contributor fix."
  ]
}
```

## Related reports

```json
[
  "bf-d161dc4fb489e64ff2aa9252"
]
```

## Notes

```json
[
  "Repo was clean initially; changes remain uncommitted and unpushed.",
  "No shell configuration changed.",
  "Kept /Users/mustafaelsayed/Workspace/typescripts/relkit-demo-7 and removed only owned disposable probes after shutdown.",
  "Command harnesses ran from the repo; actual external child working directories appear in commands and evidence.",
  "See evidence/001/final-review.txt for source review, Effect source availability, and corrected harness assumptions."
]
```

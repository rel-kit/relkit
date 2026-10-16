# bf-a5676dfc2d59af8017c415c5: PR #120 CodeQL path injection findings in recovery/evidence probes

Status: **verified**
Attempt: 1 · Updated: 2026-10-16T19:12:10+00:00

## What

PR #120 CodeQL path injection findings in recovery/evidence probes

## Expected

CLI arguments cannot select evidence write locations or inject path separators into historical log names.

## Observed before

Before the fix the real probe created a caller-selected directory and the archived phase expression returned traversal input unchanged.

## Root cause

The recovery probe passed argv[3] through resolve into mkdir and multiple writeFile calls, and called realpath(argv[2]) before establishing its temporary-root boundary. The archived probe interpolated argv[2] without restricting phases.

## Fixed by

Allocate evidence with mkdtemp instead of accepting an output path; normalize/check the temporary app boundary before realpath and validate the canonical result; select archived phases from literal before/after/smoke returns. Run regressions in the CI security suite. Native ordinary/prepared recovery matrices and prepush passed. A subsequent CodeQL run cleared alerts 80-84 and reported alert 85 at the normalized lookup. Select the lexical/canonical temporary alias first, then use one dominating containment check before realpath. Both aliases, all rejected path cases, ordinary/prepared source recovery and the required prepush gate pass again. No finding was dismissed or rule disabled.

## Changed files

- packages/cli/tests/dev-environment/recovery.probe.ts
- tests/security/dev-recovery-probe-paths.test.ts
- bug-fix-reports/issues/bf-6c1f59bebfd1c8865038fc52/evidence/001/runtime.probe.ts

## Reproduction

- Run focused path tests against the original branch and observe both assertions fail
- Replay the native probe with a caller-selected output directory and observe the directory created before rejection
- Apply owned-output and canonical-boundary changes
- Replay the same tests, then run both ordinary and prepared full HTTP recovery matrices and prepush

## Evidence

- before: [unit](evidence/001/unit-before.log) — Both original path regressions fail
- before: [integration](evidence/001/runtime-before.log) — Actual native probe creates caller-selected output
- before: [check](evidence/001/codeql-followup-before.json) — Actual new CodeQL alert 85 after original five were cleared
- before: [check](evidence/001/codeql-followup-check-before.json) — Failing hosted security check on 45f69537f
- after: [unit](evidence/001/unit-after.log) — All three security regressions pass, including boundary cases
- after: [integration](evidence/001/runtime-after.log) — Same native scenario rejects output selection without creating it
- after: [e2e](evidence/001/recovery-after.log) — Real CLI, HTTP, both startup paths, environment/source cycles and joined cleanup
- after: [check](evidence/001/prepush-result.json) — Required prepush gate command and native exit status
- after: [integration](evidence/001/followup-security.log) — Four passing tests; lexical and canonical aliases, output ownership, phases, external/sibling/symlink rejection
- after: [e2e](evidence/001/followup-recovery-after.log) — Native ordinary/prepared source recovery and joined cleanup with canonical temporary app input
- after: [check](evidence/001/followup-prepush-result.json) — Required prepush rerun after the follow-up

## Scope

```json
{
  "modules": [
    "Development recovery acceptance probe",
    "Archived preparation probe phase selector"
  ],
  "entrypoints": [
    "CLI recovery probes"
  ],
  "invariants": [
    "Evidence directories are freshly created and owned by the probe",
    "External, sibling-prefix, temporary-root and escaping symlink app arguments are rejected",
    "Archived log phases are literal before/after/smoke values",
    "Ordinary and prepared reload recovery, previous-generation HTTP and joined shutdown still work"
  ]
}
```

## Environment

```json
{
  "package": "packages/cli tests and tests/security",
  "revision": "45f69537fddb192f0755117b5e0d7658fb56d6c5 plus single-guard follow-up",
  "target": "Owned temporary fixtures, Bun 1.3.10 on macOS",
  "api_exposed": false,
  "e2e_available": true,
  "monitoring": "Native test output and CLI generation/shutdown logs; GitHub CodeQL alerts 80-84 identify the five reviewed sinks. No external application monitoring applies to these test scripts."
}
```

## Verification

```json
{
  "unit": {
    "before": {
      "status": "failed",
      "command": "bun test packages/cli/tests/dev-environment/paths.test.ts",
      "cwd": ".",
      "exit_code": 1,
      "assertion": "Path boundaries reject unsafe arguments before filesystem writes",
      "output": "evidence/001/unit-before.log"
    },
    "after": {
      "status": "passed",
      "command": "bun test tests/security/dev-recovery-probe-paths.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Both temporary path aliases remain supported; unsafe paths, evidence output selection and traversal phases remain rejected",
      "output": "evidence/001/followup-security.log"
    }
  },
  "runtime": {
    "kind": "integration",
    "reason": "The defects concern standalone test-script argv/filesystem handling, with no exposed API",
    "boundary": "Native Bun recovery probe invocation -> argument validation -> actual temporary filesystem",
    "dependencies": [
      "Actual Bun subprocess",
      "Actual filesystem; owned minimal temporary fixture"
    ],
    "steps": [
      "Invoke real probe with caller-selected evidence directory",
      "Assert nonzero exit and no evidence directory creation"
    ],
    "before": {
      "status": "failed",
      "command": "bun test packages/cli/tests/dev-environment/paths.test.ts -t 'evidence directories'",
      "cwd": ".",
      "exit_code": 1,
      "assertion": "Path boundaries reject unsafe arguments before filesystem writes",
      "output": "evidence/001/runtime-before.log"
    },
    "after": {
      "status": "passed",
      "command": "bun test tests/security/dev-recovery-probe-paths.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Both temporary path aliases remain supported; unsafe paths, evidence output selection and traversal phases remain rejected",
      "output": "evidence/001/followup-security.log"
    }
  },
  "e2e": {
    "status": "passed",
    "command": "bun packages/cli/tests/dev-environment/recovery.probe.ts <owned canonical cloned installed app> --source-only",
    "cwd": ".",
    "exit_code": 0,
    "assertion": "Both startup paths activate repaired source markers, retain last-valid HTTP during rejections and join owned descendants/listeners on shutdown using a canonical temporary path",
    "output": "evidence/001/followup-recovery-after.log"
  },
  "checks": [
    {
      "name": "prepush",
      "status": "passed",
      "command": "TURBO_CONCURRENCY=1 VITEST_MAX_WORKERS=1 RAYON_NUM_THREADS=1 UV_THREADPOOL_SIZE=1 NODE_OPTIONS=--max-old-space-size=2048 RELKIT_DOCGEN_CONCURRENCY=1 CIRCLE_NODE_TOTAL=2 nice -n 15 bun run prepush",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Required local publication gate passes again after follow-up",
      "output": "evidence/001/followup-prepush.log"
    }
  ],
  "regressions": [
    {
      "kind": "integration",
      "boundary": "Native Bun recovery probe invocation -> argument validation -> actual temporary filesystem",
      "status": "passed",
      "command": "bun test tests/security/dev-recovery-probe-paths.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Path boundaries reject unsafe arguments before filesystem writes",
      "output": "evidence/001/unit-after.log"
    },
    {
      "kind": "e2e",
      "boundary": "bun dev -> supervisor -> compiler/environment resolution -> runtime HTTP -> joined shutdown",
      "status": "passed",
      "command": "bun packages/cli/tests/dev-environment/recovery.probe.ts <owned cloned installed app>",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "All ordinary and prepared environment/source recovery and shutdown assertions pass",
      "output": "evidence/001/recovery-after.log"
    },
    {
      "kind": "integration",
      "boundary": "Native Bun probe -> normalized lexical/canonical path validation -> owned filesystem",
      "status": "passed",
      "command": "bun test tests/security/dev-recovery-probe-paths.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Both temporary path aliases remain supported; unsafe paths, evidence output selection and traversal phases remain rejected",
      "output": "evidence/001/followup-security.log"
    },
    {
      "kind": "e2e",
      "boundary": "Canonical temporary app -> native ordinary/prepared CLI -> HTTP recovery -> joined shutdown",
      "status": "passed",
      "command": "bun packages/cli/tests/dev-environment/recovery.probe.ts <owned canonical cloned installed app> --source-only",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Both startup paths activate repaired source markers, retain last-valid HTTP during rejections and join owned descendants/listeners on shutdown using a canonical temporary path",
      "output": "evidence/001/followup-recovery-after.log"
    }
  ],
  "limitations": [
    "The archived probe contains historical machine-specific setup and moved imports. Its actual phase declaration is extracted with the TypeScript parser and evaluated directly for all accepted phases and traversal inputs; the entire historical app experiment is not rerun.",
    "Native runtime replay uses a disposable cloned installed minimal app. The existing e-commerce preview is left running and is not edited.",
    "GitHub CodeQL/CI results are checked separately on the published final commit; no alerts are dismissed or scanning rules disabled.",
    "Alert 85 was reproduced as an actual failing CodeQL analysis. No additional runtime path escape was observed: all original rejection cases already passed on 45f69537f. The follow-up expresses the same dual-alias policy as one dominating containment guard.",
    "The full dotenv/source matrix in recovery-after.log was run for the first repair. After the guard-only follow-up, both temporary aliases are checked natively and the canonical-path ordinary/prepared source matrix is rerun with --source-only. Dotenv/compiler/runtime implementation is unchanged by either PR review repair."
  ]
}
```

## Related reports

```json
[]
```

## Notes

```json
[
  "Historical before/after application logs remain unchanged; only the executable archived probe phase selection is hardened.",
  "Regression tests were initially authored under packages/cli/tests/dev-environment/paths.test.ts, then moved to tests/security/dev-recovery-probe-paths.test.ts so the standard CI security gate executes them.",
  "The actual hosted CodeQL failure is retained before the follow-up. The query's primary-source StartsWithDirSanitizer and RelativePathStartsWithSanitizer were inspected; no suppression, dismissal, query exclusion, or output waiver was added."
]
```

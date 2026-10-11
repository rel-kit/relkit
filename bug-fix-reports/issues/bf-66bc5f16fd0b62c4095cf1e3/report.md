# bf-66bc5f16fd0b62c4095cf1e3: The 0.7.4 release PR fails CI and cannot certify default minimal creation.

Status: **verified**
Attempt: 2 · Updated: 2026-10-11T10:55:57+00:00

## What

The 0.7.4 release PR fails CI and cannot certify default minimal creation.

## Expected

The actual 0.7.4 package identity and minimal template are certified by matching passing evidence.

## Observed before

The release unit test rejects the 0.7.3 certification identity; the actual release command additionally rejects the stale minimal-template digest.

## Root cause

packages/create-relkit/src/create-capabilities.ts:49 and :56 still pinned release 0.7.3 and its source-template digest after PR #111 changed package and template manifests to 0.7.4. Exact identity and byte matching correctly rejected those stale certification inputs. The release versioning workflow does not automatically obtain new timing evidence.

## Fixed by

Pin the actual 0.7.4 release and exact minimal-template digest; generate new versioned evidence with all 20 fresh starts, 20 restarts, and preparation strictly below 1000 ms. Current-identity regressions, the complete evidence gate, packed release replay, 62 E2E assertions, and required prepush checks all pass.

## Changed files

- packages/create-relkit/src/create-capabilities.ts
- docs/evidence/create-capabilities/0.7.4/fresh.json
- docs/evidence/create-capabilities/0.7.4/restart.json

## Reproduction

- Check out the current changeset-release/main head
- Run bun test tests/unit/release-check.test.ts
- Run the actual release-check --ci-pack --allow-dirty command

## Evidence

- before: [unit](evidence/002/unit-before.txt) — Actual 0.7.4 identity mismatches the certified 0.7.3 identity
- before: [integration](evidence/002/runtime-before.txt) — The real artifact command rejects both release identity and template digest
- before: [integration](evidence/002/certification-fresh-1.txt) — Setup made no timing samples and stopped progressing; the owned process was stopped with SIGKILL after SIGTERM did not complete.
- before: [integration](evidence/002/certification-fresh-2.txt) — The complete second attempt returned every correct response but failed the strict per-start ceiling.
- before: [integration](evidence/002/fresh-attempt-2.json) — All 20 attempts retained: maximum2663.942625ms, median677.992396ms, five over1000ms, host load16.69/15.05/15.39.
- after: [unit](evidence/002/unit-identity-after.txt) — The original identity regression now passes; complete evidence gating remains pending.
- after: [integration](evidence/002/e2e-generator.txt) — The installed-project E2E harness passed all 62 assertions against actual 0.7.4 archives.
- after: [check](evidence/002/release-notes.txt) — Release notes and all 53 package manifests validate as 0.7.4.
- after: [integration](evidence/002/certification-fresh-3.txt) — The later complete fresh certification passed every start.
- after: [integration](evidence/002/fresh-attempt-3.json) — All 20 fresh samples retained: maximum 713.191583 ms, median 493.7399585 ms, p95 665.371875 ms.
- after: [integration](evidence/002/certification-restart-1.txt) — The full restart certification and its preparation launch passed.
- after: [integration](evidence/002/restart-attempt-1.json) — All 20 restarts retained: maximum 754.358208 ms, median 434.494729 ms, p95 559.338958 ms; preparation 426.462625 ms.
- after: [check](evidence/002/unit-capabilities-after.txt) — All five current-identity, template-byte, rejection, and complete-evidence tests passed.
- after: [integration](evidence/002/runtime-after.txt) — The actual packed release command validated 53 packages, 53 archives, and five templates.
- after: [check](evidence/002/prepush.txt) — Every required local publication gate passed.

## Scope

```json
{
  "modules": [
    "release certification",
    "create-relkit",
    "packed readiness benchmark"
  ],
  "entrypoints": [
    "bun run scripts/release-check.ts --ci-pack",
    "bun x relkit create",
    "bun dev"
  ],
  "invariants": [
    "Certification matches the actual release and template bytes",
    "All 20 fresh starts and 20 restarts plus preparation are strictly below 1000 ms",
    "Uncertified combinations remain rejected"
  ]
}
```

## Environment

```json
{
  "package": "create-relkit",
  "revision": "1b06217c92ec9f507399d94734b181963fcff121 plus certification repair; create-capabilities.ts sha256=b35e435bbb0284a8e59789a685352b9d489e5a41a9dbb870fb492f21ccd68eb8",
  "target": "PR #111 and local packed release pipeline on macOS arm64 / Bun 1.3.10",
  "api_exposed": false,
  "e2e_available": true,
  "monitoring": "GitHub Actions job logs and existing local CLI/benchmark logs; no remote APM is required for the artifact workflow."
}
```

## Verification

```json
{
  "unit": {
    "before": {
      "status": "failed",
      "command": "rtk proxy bun test tests/unit/release-check.test.ts",
      "cwd": ".",
      "exit_code": 1,
      "assertion": "Certification equals the actual packaged release identity",
      "output": "evidence/002/unit-before.txt"
    },
    "after": {
      "status": "passed",
      "command": "rtk proxy bun test tests/unit/release-check.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Certification equals the actual 0.7.4 identity; alias publication ordering and release notes remain valid",
      "output": "evidence/002/unit-identity-after.txt"
    }
  },
  "runtime": {
    "kind": "integration",
    "reason": "Release artifact construction and scaffolding expose a CLI boundary, not an HTTP API.",
    "boundary": "release-check -> actual manifests -> capability evidence gate -> artifact construction and packed CLI smoke",
    "dependencies": [
      "Actual 53 release archives and installed CLI dependencies",
      "Local isolated registry serving first-party archives and proxying npm dependencies",
      "Actual generated-project renderer and CLI aliases"
    ],
    "steps": [
      "Run release-check on PR #111",
      "Assert artifact validation succeeds"
    ],
    "before": {
      "status": "failed",
      "command": "rtk proxy bun run scripts/release-check.ts --ci-pack --allow-dirty --output /tmp/relkit-074-before-artifacts",
      "cwd": ".",
      "exit_code": 1,
      "assertion": "The 0.7.4 artifact pipeline accepts matching certification",
      "output": "evidence/002/runtime-before.txt"
    },
    "after": {
      "status": "passed",
      "command": "rtk proxy bun run scripts/release-check.ts --ci-pack --allow-dirty --output /tmp/relkit-074-validated-artifacts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "The same 0.7.4 artifact pipeline passes certification, validates 53 packages and archives plus five templates, and preserves alias smoke and scaffold equivalence",
      "output": "evidence/002/runtime-after.txt"
    }
  },
  "limitations": [
    "Validation ran on Apple M1 Pro/macOS arm64 with Bun 1.3.10. Hosted checks and release publication will be observed after pushing this repair.",
    "The first setup was deliberately stopped after no progress and produced no samples. The next full fresh set returned every correct response but failed five latency samples, with a maximum of 2663.942625 ms. Every failed sample and set remains retained. The later separate full fresh and restart sets passed; this evidence does not guarantee a one-second response under arbitrary host contention."
  ],
  "e2e": {
    "status": "passed",
    "command": "rtk proxy bun test tests/generator/installed-cli-create.test.ts",
    "cwd": ".",
    "exit_code": 0,
    "assertion": "All 62 assertions pass for installed 0.7.4 projects: correct HTTP bodies, real inspector, snapshot reuse and recovery, manual no-install preparation, generated checks/typecheck/tests/build, production start, and uncertified agent rejection before creating a destination.",
    "output": "evidence/002/e2e-generator.txt"
  },
  "checks": [
    {
      "name": "release notes and all53 manifests",
      "status": "passed",
      "command": "rtk proxy bun run scripts/release-check.ts --notes-only --allow-dirty",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/002/release-notes.txt"
    },
    {
      "name": "complete capability evidence gate",
      "status": "passed",
      "command": "rtk proxy bun x --bun vitest run --config packages/create-relkit/vitest.config.ts packages/create-relkit/tests/create-capabilities.effect.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/002/unit-capabilities-after.txt"
    },
    {
      "name": "repository prepush",
      "status": "passed",
      "command": "rtk proxy bun run prepush",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/002/prepush.txt"
    }
  ],
  "regressions": [
    {
      "kind": "integration",
      "boundary": "CLI validation -> destination planning",
      "status": "passed",
      "command": "rtk proxy bun test tests/generator/installed-cli-create.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "An uncertified agent returns RELKIT_CREATE_USAGE and creates no destination.",
      "output": "evidence/002/e2e-generator.txt"
    },
    {
      "kind": "integration",
      "boundary": "installed generated app -> snapshot preparation -> backend and inspector",
      "status": "passed",
      "command": "rtk proxy bun test tests/generator/installed-cli-create.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Manual no-install preparation, corrupt snapshot recovery and production start preserve correct HTTP contracts.",
      "output": "evidence/002/e2e-generator.txt"
    }
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
  "The original GitHub CI failure and local unit baseline used PR #111 head 1b06217c92ec9f507399d94734b181963fcff121. Runtime replay used that versioning commit plus only the certification pins and new evidence.",
  "The first setup was deliberately terminated with SIGKILL after SIGTERM did not complete; its 137 exit is attributable to that action. Its underlying lack of progress was not diagnosed as OOM or a specific runtime defect.",
  "All 20 samples from the failed next fresh set remain in fresh-attempt-2.json: runs 1, 2, 3, 14, and 16 exceeded 1000 ms. No timing sample was discarded or rewritten.",
  "The passing reports were generated by the existing packed benchmark and copied byte-for-byte into versioned evidence. The recorded CLI version is 0.7.4, Bun is 1.3.10, TypeScript is 5.9.3, and the minimal template digest is d5fdd807e4320b957c1343274c27b0208c26e8e51d858a20c61191601bfa8098.",
  "The user's strict one-second ceiling remains unchanged. Fresh and restart sets were run sequentially without other agent-started builds competing with their measurements."
]
```

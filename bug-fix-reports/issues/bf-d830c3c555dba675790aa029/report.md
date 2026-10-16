# bf-d830c3c555dba675790aa029: The commerce application cannot prepare a development snapshot despite using declarative Better Auth and SQLite descriptors.

Status: **verified**
Attempt: 1 · Updated: 2026-10-15T23:45:31+00:00

## What

The commerce application cannot prepare a development snapshot despite using declarative Better Auth and SQLite descriptors.

## Expected

An explicitly supported declarative commerce app can prepare and activate a verified snapshot; ambient construction and arbitrary metadata callbacks stay ineligible.

## Observed before

The real CLI exits nonzero at compilation.dynamic before preparation can produce a session.

## Root cause

snapshot-eligibility.ts lacked audited commerce constructors and inert helper declarations while snapshot-preparation-guards.ts audited unrelated tooling. The app also read an ambient auth origin and used unaudited schema spreads. Its root SQLite shared-memory file changed on activation, correctly invalidating complete source fingerprints; renderDatabaseEffect generated that root-state default. Added dirname usage exposed generic DATABASE_PATH string|undefined typing, requiring validation before native acquisition. Closure hardening rejects aliases, package shadows, macros, preloads and case variants without skipping executable backend sources.

## Fixed by

Verified explicit commerce preparation and actual capsule activation, all16 identical recovery scenarios with unchanged CLI55765, and final current snapshot317e000a... after all source fixes. Full30 local framework stages plus supplemental native/Bun checks pass. SQLite runtime data was copied without loss to .relkit/state and the original backup preserved. Static callback, ambient/default, alias/package-shadow/preload/macro and case-variant guards reject unsafe construction. Generator state defaults, missing-parent handling and optional path narrowing pass native CLI and acquisition/migration proofs. All changes remain uncommitted.

## Changed files

- packages/cli/src/dev-snapshot/snapshot-eligibility.ts
- packages/cli/src/dev-snapshot/snapshot-eligibility-expressions.ts
- packages/cli/src/dev-snapshot/snapshot-default-eligibility.ts
- packages/cli/src/dev-snapshot/snapshot-preparation-guards.ts
- packages/cli/src/dev-snapshot/snapshot-commerce-eligibility.ts
- packages/cli/src/dev-snapshot/snapshot-sqlite-eligibility.ts
- packages/cli/tests/dev-snapshot/commerce-eligibility.test.ts
- packages/cli/tests/dev-snapshot/commerce-project-eligibility.test.ts
- packages/create-relkit/src/render-database.ts
- packages/create-relkit/src/render-database-sources.ts
- tests/generator/sqlite-app-tooling.test.ts
- tests/generator/sqlite-state-path.test.ts
- .changeset/prepared-commerce-eligibility.md
- tests/generator/sqlite-path-typing.test.ts

## Reproduction

- Use the physical local-package installation of the real commerce app
- Run its source CLI dev --prepare on ports 3400/3410
- Observe compilation.dynamic and nonzero exit before snapshot publication

## Evidence

- before: [integration](evidence/001/runtime-before.log) — Real CLI compilation.dynamic rejection
- before: [unit](evidence/001/unit-before.log) — Audited schema rejected; imported tooling was accepted
- before: [integration](evidence/001/activation-before-state-relocation.log) — Intact guard rejects mutable root SQLite input at activation
- before: [integration](evidence/001/generator-before.log) — Generated default is wrong; actual native client and migrator fail on missing state parents
- before: [unit](evidence/001/resolution-before.log) — Extra constructor alias was not rejected
- before: [unit](evidence/001/import-attributes-before.log) — Macro import attributes bypass runtime-only interpretation
- before: [unit](evidence/001/case-policy-before.log) — Mixed-case authored shadow evades case-sensitive guard on verified case-insensitive Mac filesystem
- after: [integration](evidence/001/prepare-state.log) — Successful real commerce preparation
- after: [integration](evidence/001/prepared-activation.json) — Verified actual capsule activation, no ordinary fallback before matrix
- after: [integration](evidence/001/database-relocation.json) — Byte-identical database copy, integrity_check and preserved original
- after: [integration](evidence/001/recovery.txt) — All 16 same recovery scenarios pass with unchanged CLI
- after: [unit](evidence/001/resolution-after.log) — Explicit positive syntax and adversarial closure cases pass
- after: [integration](evidence/001/generator-after.log) — Default, lazy acquisition and repeated migrations pass
- after: [api](evidence/001/commerce.txt) — Actual HTTP authentication, transactions, persistence and concurrency
- after: [api](evidence/001/adjacent.txt) — Historical prices and unavailable checkout invariants
- after: [unit](evidence/001/case-policy-after.log) — Native file guard rejects all mixed-case config, shadow, preload and nested dependency variants
- after: [integration](evidence/001/prepare-final.log) — Final real source CLI preparation passes after all framework fixes and docs updates
- after: [integration](evidence/001/final-live.log) — Complete current capsule validation before and after authenticated live business reads
- after: [integration](evidence/001/framework-final-summary.json) — All30 local framework stages and supplemental checks pass
- after: [integration](evidence/001/final-audit.json) — Evidence secret scan, approved process ownership, nice15 and empty staging audit
- after: [integration](evidence/001/final-source-hashes.json) — Final14 scoped source and regression file identities including generated-path typing fix

## Scope

```json
{
  "modules": [
    "DevSnapshotEligibility",
    "SnapshotPreparation",
    "SQLite metadata construction"
  ],
  "entrypoints": [
    "relkit dev --prepare",
    "relkit dev"
  ],
  "invariants": [
    "No ambient construction or arbitrary metadata callback is accepted",
    "All source and dependency bytes stay fingerprinted",
    "Native database acquisition happens only during candidate activation",
    "Excluded tooling cannot enter the backend via imports or reexports"
  ]
}
```

## Environment

```json
{
  "package": "packages/cli",
  "revision": "ebc3a2544 plus preserved uncommitted recovery changes and scoped commerce eligibility changes",
  "target": "/Users/mustafaelsayed/Workspace/typescripts/relkit-ecommerce-lab on ports 3400 and 3410",
  "api_exposed": false,
  "e2e_available": true,
  "monitoring": "Local CLI logs and real inspector; no external monitoring service used. Secrets are redacted and scanned before evidence retention."
}
```

## Verification

```json
{
  "unit": {
    "before": {
      "status": "failed",
      "command": "bunx vitest run packages/cli/tests/dev-snapshot/commerce-eligibility.test.ts --maxWorkers=1 --no-file-parallelism",
      "cwd": ".",
      "exit_code": 1,
      "assertion": "Audited commerce metadata qualifies and excluded tooling imports reject",
      "output": "evidence/001/unit-before.log"
    },
    "after": {
      "status": "passed",
      "command": "bunx vitest run packages/cli/tests/dev-snapshot/commerce-eligibility.test.ts packages/cli/tests/dev-snapshot/commerce-project-eligibility.test.ts --maxWorkers=1 --no-file-parallelism",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Commerce qualifies; ambient metadata, eager clients, macros, aliases, preloads, package shadows and case variants reject",
      "output": "evidence/001/case-policy-after.log"
    }
  },
  "runtime": {
    "kind": "integration",
    "reason": "Prepared snapshot eligibility is a CLI boundary, without an application API for granting preparation authority.",
    "boundary": "Source CLI prepare -> static eligibility -> actual compiler/typecheck/build -> fingerprint/dependency/publication guards",
    "dependencies": [
      "Real commerce application",
      "Physical installation of 37 locally packed framework packages",
      "Actual Bun SQLite and Better Auth, no mocks"
    ],
    "steps": [
      "Run real commerce prepare before the fix",
      "Apply explicit audited support and move only mutable database state",
      "Repeat prepare",
      "Activate the verified capsule",
      "Run the same 16-scenario source/environment recovery matrix"
    ],
    "before": {
      "status": "failed",
      "command": "bun run relkit dev --prepare --port 3400 --inspector-port 3410 --local off --no-color --verbose",
      "cwd": ".",
      "exit_code": 1,
      "assertion": "Real commerce preparation succeeds without ambient compilation or guard bypass",
      "output": "evidence/001/runtime-before.log"
    },
    "after": {
      "status": "passed",
      "command": "bun run relkit dev --prepare --port 3400 --inspector-port 3410 --local off --no-color --verbose",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Real commerce preparation succeeds under the intact byte and eligibility guards",
      "output": "evidence/001/prepare-final.log"
    }
  },
  "e2e": {
    "status": "passed",
    "command": "RELKIT_LAB_CLI_PID=55765 RELKIT_LAB_EVIDENCE=.relkit/evidence/commerce-prepared-support-20261016 bun scripts/recovery-proof.ts",
    "cwd": ".",
    "exit_code": 0,
    "assertion": "All16 same source, graph, config, import, dotenv and rapid-save scenarios recover on unchanged CLI; source and environment restored",
    "output": "evidence/001/recovery.txt"
  },
  "regressions": [
    {
      "kind": "integration",
      "boundary": "Generated scaffold -> native SQLite acquisition and migration",
      "status": "passed",
      "command": "bun test tests/generator/sqlite-state-path.test.ts tests/generator/sqlite-app-tooling.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Default state path, missing parent creation, lazy client acquisition and repeated actual migrations pass",
      "output": "evidence/001/generator-after.log"
    },
    {
      "kind": "api",
      "boundary": "HTTP auth -> cart/orders -> actual SQLite -> independent read-back",
      "status": "passed",
      "command": "bun scripts/commerce-proof.ts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Correct totals, owner isolation, persisted item snapshots, cart clearing and exactly one concurrent checkout",
      "output": "evidence/001/commerce.txt"
    },
    {
      "kind": "api",
      "boundary": "Catalog prices -> checkout and prior order reads",
      "status": "passed",
      "command": "bun scripts/adjacent-proof.ts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Historical snapshots survive price changes; unavailable checkout makes no order write",
      "output": "evidence/001/adjacent.txt"
    },
    {
      "kind": "integration",
      "boundary": "Actual DevSnapshots.validate current inputs/dependencies/artifacts/cohort -> live authenticated HTTP -> persisted SQLite -> repeat complete validation",
      "status": "passed",
      "command": "bun test-results/commerce-prepared-support-20261016/final-live.probe.ts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Final capsule current before and after live session/cart/order/read-back and all3 links; sameCLI55765",
      "output": "evidence/001/final-live.log"
    }
  ],
  "checks": [
    {
      "name": "CLI typecheck",
      "status": "passed",
      "command": "bunx tsc -p packages/cli/tsconfig.json --noEmit --tsBuildInfoFile test-results/commerce-prepared-support-20261016/cli.tsbuildinfo",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/cli-typecheck.log"
    },
    {
      "name": "snapshot Vitest",
      "status": "passed",
      "command": "bunx vitest run packages/cli/tests/dev-snapshot --exclude **/input-watch.test.ts --exclude **/template-compatibility.test.ts --maxWorkers=1 --no-file-parallelism",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/snapshot-vitest.log"
    },
    {
      "name": "snapshot native Bun",
      "status": "passed",
      "command": "bun test packages/cli/tests/dev-snapshot/input-watch.test.ts packages/cli/tests/dev-snapshot/template-compatibility.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/snapshot-bun.log"
    },
    {
      "name": "app typecheck",
      "status": "passed",
      "command": "bun run typecheck",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/app-typecheck.log"
    },
    {
      "name": "app unit",
      "status": "passed",
      "command": "bun test",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/app-unit.log"
    },
    {
      "name": "Framework 01-build",
      "status": "passed",
      "command": "bun run build",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/framework-final-summary.json"
    },
    {
      "name": "Framework 02-docs",
      "status": "passed",
      "command": "bun x turbo run check test --filter=@relkit/docs --concurrency=1",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/framework-final-summary.json"
    },
    {
      "name": "Framework 03-restart",
      "status": "passed",
      "command": "bun run test:restart",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/framework-final-summary.json"
    },
    {
      "name": "Framework 04-jobs-coverage",
      "status": "passed",
      "command": "bun run test:jobs:coverage",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/framework-final-summary.json"
    },
    {
      "name": "Framework 05-jobs-mutation",
      "status": "passed",
      "command": "bun x stryker run scripts/jobs-coverage/stryker.config.mjs --concurrency 1",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/framework-final-summary.json"
    },
    {
      "name": "Framework 06-mutation-verification",
      "status": "passed",
      "command": "bun scripts/jobs-coverage/verify-mutation.ts",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/framework-final-summary.json"
    },
    {
      "name": "Framework 07-e2e-inspector",
      "status": "passed",
      "command": "bun x playwright test --workers=1 --output=test-results/inspector",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/framework-final-summary.json"
    },
    {
      "name": "Framework 08-e2e-commerce",
      "status": "passed",
      "command": "bun x playwright test --config=playwright.commerce.config.ts --workers=1 --output=test-results/commerce",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/framework-final-summary.json"
    },
    {
      "name": "Framework 09-jobs-matrix",
      "status": "passed",
      "command": "bun run test:jobs:matrix",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/framework-final-summary.json"
    },
    {
      "name": "Framework 10-types",
      "status": "passed",
      "command": "bun run test:types",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/framework-final-summary.json"
    },
    {
      "name": "Framework 11-unit",
      "status": "passed",
      "command": "bun run test:unit",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/framework-final-summary.json"
    },
    {
      "name": "Framework 12-compiler",
      "status": "passed",
      "command": "bun test --timeout 15000 ./tests/compiler",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/framework-final-summary.json"
    },
    {
      "name": "Framework 13-graph",
      "status": "passed",
      "command": "bun x vitest run --config packages/graph/vitest.config.ts --maxWorkers=1",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/framework-final-summary.json"
    },
    {
      "name": "Framework 14-contracts",
      "status": "passed",
      "command": "bun run test:contracts",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/framework-final-summary.json"
    },
    {
      "name": "Framework 15-integration",
      "status": "passed",
      "command": "bun run test:integration",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/framework-final-summary.json"
    },
    {
      "name": "Framework 16-inspector",
      "status": "passed",
      "command": "bun run test:inspector",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/framework-final-summary.json"
    },
    {
      "name": "Framework 17-container",
      "status": "passed",
      "command": "bun run test:container",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/framework-final-summary.json"
    },
    {
      "name": "Framework 18-security",
      "status": "passed",
      "command": "bun run test:security",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/framework-final-summary.json"
    },
    {
      "name": "Framework 19-deployment",
      "status": "passed",
      "command": "bun run test:deployment",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/framework-final-summary.json"
    },
    {
      "name": "Framework 20-examples",
      "status": "passed",
      "command": "bun run test:examples",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/framework-final-summary.json"
    },
    {
      "name": "Framework 21-packages",
      "status": "passed",
      "command": "bun run test:packages",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/framework-final-summary.json"
    },
    {
      "name": "Framework 22-generator",
      "status": "passed",
      "command": "bun run test:generator",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/framework-final-summary.json"
    },
    {
      "name": "Framework 25-certification-bun",
      "status": "passed",
      "command": "bun test scripts/tests/dev-readiness/bootstrap-imports.test.ts scripts/tests/packed-manifest.test.ts scripts/tests/registry-cache.test.ts scripts/tests/release-command.test.ts packages/cli/tests/dev-snapshot/input-watch.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/framework-final-summary.json"
    },
    {
      "name": "Framework 26-certification-vitest",
      "status": "passed",
      "command": "bun x vitest run --maxWorkers=1 scripts/tests/benchmark-packed-cleanup.test.ts scripts/tests/benchmark-packed-dev.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/framework-final-summary.json"
    },
    {
      "name": "Framework 27-guardrails",
      "status": "passed",
      "command": "bun test tests/phase0.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/framework-final-summary.json"
    },
    {
      "name": "Framework 28-lint",
      "status": "passed",
      "command": "bun run lint",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/framework-final-summary.json"
    },
    {
      "name": "Framework 29-boundaries",
      "status": "passed",
      "command": "bun run check",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/framework-final-summary.json"
    },
    {
      "name": "Framework 30-konsistent",
      "status": "passed",
      "command": "bun run konsistent -- validate",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/framework-final-summary.json"
    },
    {
      "name": "Framework 31-format",
      "status": "passed",
      "command": "bun x prettier --check .changeset/dev-environment-recovery.md .changeset/prepared-commerce-eligibility.md .changeset/prepared-template-compatibility.md .changeset/sqlite-app-tooling.md apps/docs/content/docs/fundamentals/environment.mdx docs/evidence/create-capabilities/0.7.6/fresh.json docs/evidence/create-capabilities/0.7.6/restart.json packages/cli/src/commands/build-server-invocation.ts packages/cli/src/commands/dev-environment-files.ts packages/cli/src/commands/dev-session-engine.ts packages/cli/src/commands/dev-session.types.ts packages/cli/src/commands/dev-watch.ts packages/cli/src/dev-snapshot/snapshot-commerce-eligibility.ts packages/cli/src/dev-snapshot/snapshot-default-eligibility.ts packages/cli/src/dev-snapshot/snapshot-eligibility-expressions.ts packages/cli/src/dev-snapshot/snapshot-eligibility.schemas.ts packages/cli/src/dev-snapshot/snapshot-eligibility.ts packages/cli/src/dev-snapshot/snapshot-epoch-path.ts packages/cli/src/dev-snapshot/snapshot-hash-worker.ts packages/cli/src/dev-snapshot/snapshot-input-watch.ts packages/cli/src/dev-snapshot/snapshot-preparation-guards.ts packages/cli/src/dev-snapshot/snapshot-sqlite-eligibility.ts packages/cli/src/dev-snapshot/snapshot.schemas.ts packages/cli/src/services/dev-environment.schemas.ts packages/cli/src/services/dev-environment.service.ts packages/cli/src/services/dev-environment.types.ts packages/cli/src/services/dev-supervisor.service.ts packages/cli/tests/dev-environment/recovery-cycles.ts packages/cli/tests/dev-environment/recovery-process.ts packages/cli/tests/dev-environment/recovery.probe.ts packages/cli/tests/dev-environment/recovery.types.ts packages/cli/tests/dev-snapshot/commerce-eligibility.test.ts packages/cli/tests/dev-snapshot/commerce-project-eligibility.test.ts packages/cli/tests/dev-snapshot/template-compatibility.test.ts packages/cli/tests/services/dev-environment-errors.test.ts packages/cli/tests/services/dev-environment-native.test.ts packages/cli/tests/services/dev-environment-values.test.ts packages/cli/tests/services/dev-invocation-environment.test.ts packages/cli/tests/services/dev-support-fixture.ts packages/cli/tests/services/source-watch-fixture.ts packages/cli/tests/services/source-watch-synchronous.test.ts packages/cli/tests/services/source-watch.test.ts packages/create-relkit/src/create-capabilities.ts packages/create-relkit/src/render-database-sources.ts packages/create-relkit/src/render-database.ts packages/supervisor/src/candidate-process.ts packages/supervisor/tests/compatibility/environment.test.ts templates/default/v1/agent/tsconfig.json templates/default/v1/api/tsconfig.json templates/default/v1/fullstack/tsconfig.json templates/default/v1/minimal/tsconfig.json templates/default/v1/tasks/tsconfig.json tests/generator/sqlite-app-tooling.test.ts tests/generator/sqlite-path-typing.test.ts tests/generator/sqlite-state-path.test.ts tests/integration/fixtures/paired-commerce-project.ts tests/unit/paired-commerce-project.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/framework-final-summary.json"
    },
    {
      "name": "Framework 32-observability",
      "status": "passed",
      "command": "bun scripts/check-observability-sinks.ts",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/framework-final-summary.json"
    }
  ],
  "limitations": [
    "Local execution only; cloud acceptance disabled and declared opt-in/platform skips retained",
    "Supplemental Node runtime attempt failed because Bun globals were unavailable; same package passed with documented Bun runtime",
    "Initial partial certification stopped administratively for reproduced Mac integrity hardening, with rollback and cleanup before complete replay"
  ]
}
```

## Related reports

```json
[
  "bf-6c1f59bebfd1c8865038fc52",
  "bf-c7e0a9416b68b0c54a9942e6",
  "bf-0540debf572ceef2383c053a"
]
```

## Notes

```json
[
  "Application command cwd is the separate commerce lab at /Users/mustafaelsayed/Workspace/typescripts/relkit-ecommerce-lab; the report helper confines cwd metadata to repository-relative locations, so '.' entries for scripts/commerce-proof.ts, scripts/adjacent-proof.ts, recovery and app commands refer to that explicitly identified target, not a script in the framework checkout.",
  "Initial snapshot-suite collection mistakenly sent two Bun-only files to Vitest. That setup failure remains in snapshot-suite.log; correct split runner checks passed. Five native tests are intentionally skipped by their existing platform/environment gates.",
  "The first prepared capsule is used once; edited generations deliberately acquire the existing safe compiler. The unchanged CLI identity is asserted across all16 scenarios.",
  "The read-only repos/effect checkout lacks Effect.ts implementation in this checkout; installed Effect4.0.1 source and upstream test/example usages were inspected. No Effect library APIs or versions were changed.",
  "No cloud, external provider, Docker resource, commit, staging or push operation was performed by this chat. Live app tree remains at nice15 with user authorization.",
  "Full generator acceptance exposed TS2345 after directory creation was added: generic env.DATABASE_PATH is string|undefined. The coordinating chat reproduced native CLI check and route acceptance failures, then narrowed and rejected missing/empty paths before dirname or Database acquisition. All focused starter, native CLI and bad-path replays pass; full generator validation remains pending.",
  "Final source hashes include the coordinating chats optional-path renderer fix and native typing regression. Earlier13-file hashes remain in pre-generator-typing-source-hashes.json. All30 actual command results are retained in the coordinated framework aggregate; raw logs remain in test-results/full-suite-20261016.",
  "Final audit confirms private values absent from all retained app/issue evidence, only the approved live app tree remains at nice15, former temporary dev trees stopped, zero staged paths and no commits/pushes. No fingerprinted app input was changed after final preparation."
]
```

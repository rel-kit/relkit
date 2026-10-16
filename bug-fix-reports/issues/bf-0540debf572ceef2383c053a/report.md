# bf-0540debf572ceef2383c053a: generated sqlite service fails strict project compilation

Status: **verified**
Attempt: 1 · Updated: 2026-10-15T23:42:50+00:00

## What

generated sqlite service fails strict project compilation

## Expected

Generated SQLite/auth projects compile strictly, missing/empty database paths reject before acquisition, and explicit nested state paths work.

## Observed before

Native generated-project check exits1 with TS2345 at dirname(env.DATABASE_PATH); missing path callback produces an incidental TypeError.

## Root cause

databaseServiceSource adds mkdirSync(dirname(env.DATABASE_PATH)) before narrowing the generic string|undefined environment entry; Bun Database previously accepted an optional path but node:path.dirname requires a string.

## Fixed by

Validate and narrow DATABASE_PATH before directory creation and database acquisition. All four starters, the same native CLI check, missing and empty path controls, a real nested SQLite query, the complete generator suite, and final repository gates pass.

## Changed files

- packages/create-relkit/src/render-database-sources.ts
- tests/generator/sqlite-path-typing.test.ts
- tests/generator/sqlite-state-path.test.ts
- .changeset/prepared-commerce-eligibility.md

## Reproduction

- Run route-platform generator acceptance before editing.
- Generate minimal app, add SQLite database and auth, link installed dependencies, invoke actual source CLI check --json.
- Invoke real generated client with missing/empty and explicit nested path.

## Evidence

- before: [unit](evidence/001/unit-before.log) — Same compiler diagnostic in focused existing acceptance.
- before: [integration](evidence/001/runtime-before.log) — Actual CLI returns non-activatable graph with TS2345.
- before: [integration](evidence/001/missing-before.log) — Native generated client missing-path assertion fails before repair.
- after: [unit](evidence/001/unit-after.log) — Same route/platform test now passes all4 starters.
- after: [integration](evidence/001/runtime-after.log) — Same actual nativeCLI graph check is now ok, activatable and diagnostic-free.
- after: [integration](evidence/001/missing-after.log) — Real generated callback rejects missing/empty path and opens explicit nested SQLite state path.
- after: [integration](evidence/001/full-suite-results.jsonl) — Actual latest serial results for every local validation stage.

## Scope

```json
{
  "modules": [
    "DatabaseScaffold",
    "DrizzleClientLifecycle",
    "ProjectCompiler"
  ],
  "entrypoints": [
    "relkit add database --dialect sqlite",
    "relkit check"
  ],
  "invariants": [
    "Generic optional environment contexts compile",
    "Absent paths reject before filesystem/database work",
    "Explicit nested paths retain lazy acquisition and proper close"
  ]
}
```

## Environment

```json
{
  "package": "create-relkit",
  "revision": "ebc3a2544ad5521016fd9efc8db3ff1930a3fb75 plus uncommitted recovery, prepared-commerce and certificate fixes",
  "target": "Local macOS Bun 1.3.10 / Effect 4.0.1; real CLI and HTTP fixtures",
  "api_exposed": false,
  "e2e_available": true,
  "monitoring": "Existing CLI lifecycle/HTTP logs, owned process inventory, native benchmark metrics and physical file hashes; no remote monitoring used."
}
```

## Verification

```json
{
  "checks": [
    {
      "name": "01-build",
      "status": "passed",
      "command": "bun run build",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/full-suite-results.jsonl"
    },
    {
      "name": "02-docs",
      "status": "passed",
      "command": "bun x turbo run check test --filter=@relkit/docs --concurrency=1",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/full-suite-results.jsonl"
    },
    {
      "name": "03-restart",
      "status": "passed",
      "command": "bun run test:restart",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/full-suite-results.jsonl"
    },
    {
      "name": "04-jobs-coverage",
      "status": "passed",
      "command": "bun run test:jobs:coverage",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/full-suite-results.jsonl"
    },
    {
      "name": "05-jobs-mutation",
      "status": "passed",
      "command": "bun x stryker run scripts/jobs-coverage/stryker.config.mjs --concurrency 1",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/full-suite-results.jsonl"
    },
    {
      "name": "06-mutation-verification",
      "status": "passed",
      "command": "bun scripts/jobs-coverage/verify-mutation.ts",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/full-suite-results.jsonl"
    },
    {
      "name": "07-e2e-inspector",
      "status": "passed",
      "command": "bun x playwright test --workers=1 --output=test-results/inspector",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/full-suite-results.jsonl"
    },
    {
      "name": "08-e2e-commerce",
      "status": "passed",
      "command": "bun x playwright test --config=playwright.commerce.config.ts --workers=1 --output=test-results/commerce",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/full-suite-results.jsonl"
    },
    {
      "name": "09-jobs-matrix",
      "status": "passed",
      "command": "bun run test:jobs:matrix",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/full-suite-results.jsonl"
    },
    {
      "name": "10-types",
      "status": "passed",
      "command": "bun run test:types",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/full-suite-results.jsonl"
    },
    {
      "name": "11-unit",
      "status": "passed",
      "command": "bun run test:unit",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/full-suite-results.jsonl"
    },
    {
      "name": "12-compiler",
      "status": "passed",
      "command": "bun test --timeout 15000 ./tests/compiler",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/full-suite-results.jsonl"
    },
    {
      "name": "13-graph",
      "status": "passed",
      "command": "bun x vitest run --config packages/graph/vitest.config.ts --maxWorkers=1",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/full-suite-results.jsonl"
    },
    {
      "name": "14-contracts",
      "status": "passed",
      "command": "bun run test:contracts",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/full-suite-results.jsonl"
    },
    {
      "name": "15-integration",
      "status": "passed",
      "command": "bun run test:integration",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/full-suite-results.jsonl"
    },
    {
      "name": "16-inspector",
      "status": "passed",
      "command": "bun run test:inspector",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/full-suite-results.jsonl"
    },
    {
      "name": "17-container",
      "status": "passed",
      "command": "bun run test:container",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/full-suite-results.jsonl"
    },
    {
      "name": "18-security",
      "status": "passed",
      "command": "bun run test:security",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/full-suite-results.jsonl"
    },
    {
      "name": "19-deployment",
      "status": "passed",
      "command": "bun run test:deployment",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/full-suite-results.jsonl"
    },
    {
      "name": "20-examples",
      "status": "passed",
      "command": "bun run test:examples",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/full-suite-results.jsonl"
    },
    {
      "name": "21-packages",
      "status": "passed",
      "command": "bun run test:packages",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/full-suite-results.jsonl"
    },
    {
      "name": "22-generator",
      "status": "passed",
      "command": "bun run test:generator",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/full-suite-results.jsonl"
    },
    {
      "name": "25-certification-bun",
      "status": "passed",
      "command": "bun test scripts/tests/dev-readiness/bootstrap-imports.test.ts scripts/tests/packed-manifest.test.ts scripts/tests/registry-cache.test.ts scripts/tests/release-command.test.ts packages/cli/tests/dev-snapshot/input-watch.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/full-suite-results.jsonl"
    },
    {
      "name": "26-certification-vitest",
      "status": "passed",
      "command": "bun x vitest run --maxWorkers=1 scripts/tests/benchmark-packed-cleanup.test.ts scripts/tests/benchmark-packed-dev.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/full-suite-results.jsonl"
    },
    {
      "name": "27-guardrails",
      "status": "passed",
      "command": "bun test tests/phase0.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/full-suite-results.jsonl"
    },
    {
      "name": "28-lint",
      "status": "passed",
      "command": "bun run lint",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/full-suite-results.jsonl"
    },
    {
      "name": "29-boundaries",
      "status": "passed",
      "command": "bun run check",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/full-suite-results.jsonl"
    },
    {
      "name": "30-konsistent",
      "status": "passed",
      "command": "bun run konsistent -- validate",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/full-suite-results.jsonl"
    },
    {
      "name": "31-format",
      "status": "passed",
      "command": "bun x prettier --check .changeset/dev-environment-recovery.md .changeset/prepared-commerce-eligibility.md .changeset/prepared-template-compatibility.md .changeset/sqlite-app-tooling.md apps/docs/content/docs/fundamentals/environment.mdx docs/evidence/create-capabilities/0.7.6/fresh.json docs/evidence/create-capabilities/0.7.6/restart.json packages/cli/src/commands/build-server-invocation.ts packages/cli/src/commands/dev-environment-files.ts packages/cli/src/commands/dev-session-engine.ts packages/cli/src/commands/dev-session.types.ts packages/cli/src/commands/dev-watch.ts packages/cli/src/dev-snapshot/snapshot-commerce-eligibility.ts packages/cli/src/dev-snapshot/snapshot-default-eligibility.ts packages/cli/src/dev-snapshot/snapshot-eligibility-expressions.ts packages/cli/src/dev-snapshot/snapshot-eligibility.schemas.ts packages/cli/src/dev-snapshot/snapshot-eligibility.ts packages/cli/src/dev-snapshot/snapshot-epoch-path.ts packages/cli/src/dev-snapshot/snapshot-hash-worker.ts packages/cli/src/dev-snapshot/snapshot-input-watch.ts packages/cli/src/dev-snapshot/snapshot-preparation-guards.ts packages/cli/src/dev-snapshot/snapshot-sqlite-eligibility.ts packages/cli/src/dev-snapshot/snapshot.schemas.ts packages/cli/src/services/dev-environment.schemas.ts packages/cli/src/services/dev-environment.service.ts packages/cli/src/services/dev-environment.types.ts packages/cli/src/services/dev-supervisor.service.ts packages/cli/tests/dev-environment/recovery-cycles.ts packages/cli/tests/dev-environment/recovery-process.ts packages/cli/tests/dev-environment/recovery.probe.ts packages/cli/tests/dev-environment/recovery.types.ts packages/cli/tests/dev-snapshot/commerce-eligibility.test.ts packages/cli/tests/dev-snapshot/commerce-project-eligibility.test.ts packages/cli/tests/dev-snapshot/template-compatibility.test.ts packages/cli/tests/services/dev-environment-errors.test.ts packages/cli/tests/services/dev-environment-native.test.ts packages/cli/tests/services/dev-environment-values.test.ts packages/cli/tests/services/dev-invocation-environment.test.ts packages/cli/tests/services/dev-support-fixture.ts packages/cli/tests/services/source-watch-fixture.ts packages/cli/tests/services/source-watch-synchronous.test.ts packages/cli/tests/services/source-watch.test.ts packages/create-relkit/src/create-capabilities.ts packages/create-relkit/src/render-database-sources.ts packages/create-relkit/src/render-database.ts packages/supervisor/src/candidate-process.ts packages/supervisor/tests/compatibility/environment.test.ts templates/default/v1/agent/tsconfig.json templates/default/v1/api/tsconfig.json templates/default/v1/fullstack/tsconfig.json templates/default/v1/minimal/tsconfig.json templates/default/v1/tasks/tsconfig.json tests/generator/sqlite-app-tooling.test.ts tests/generator/sqlite-path-typing.test.ts tests/generator/sqlite-state-path.test.ts tests/integration/fixtures/paired-commerce-project.ts tests/unit/paired-commerce-project.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/full-suite-results.jsonl"
    },
    {
      "name": "32-observability",
      "status": "passed",
      "command": "bun scripts/check-observability-sinks.ts",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/full-suite-results.jsonl"
    },
    {
      "name": "affected-create-package-after-path-fix",
      "status": "passed",
      "command": "bun x --bun vitest run --config packages/create-relkit/vitest.config.ts --maxWorkers=1",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/affected-create-package.log"
    }
  ],
  "limitations": [
    "Local verification only; cloud acceptance and declared opt-in environment/platform tests remain skipped.",
    "Stryker793 result retained only after all 80 recorded source/test contents matched current bytes; every other suite stage reran.",
    "Performance samples refer to the exact packed artifact hashes recorded in the local certificate, not hosted CI or a published release."
  ],
  "unit": {
    "before": {
      "status": "failed",
      "command": "bun test tests/generator/add-platform-acceptance.test.ts --test-name-pattern \"route platform\"",
      "cwd": ".",
      "exit_code": 1,
      "assertion": "Generated SQLite/auth service compiles across starters",
      "output": "evidence/001/unit-before.log"
    },
    "after": {
      "status": "passed",
      "command": "bun test tests/generator/add-platform-acceptance.test.ts --test-name-pattern \"route platform\"",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Same acceptance compiles all 4 starters",
      "output": "evidence/001/unit-after.log"
    }
  },
  "runtime": {
    "kind": "integration",
    "reason": "The owning generator and compiler workflows are native CLI boundaries, with no HTTP API.",
    "boundary": "Public scaffold plan/apply -> real generated SQLite/auth source -> actual CLI check -> strict TypeScript and activatable graph",
    "dependencies": [
      "Actual maintained minimal template",
      "Installed workspace authoring and compiler libraries",
      "Real native CLI subprocess and filesystem"
    ],
    "steps": [
      "Generate minimal app and add SQLite/auth",
      "Run actual CLI check with JSON diagnostics",
      "Assert valid and activatable graph with no diagnostics",
      "Reject missing/empty native paths",
      "Open/query/close nested native SQLite file"
    ],
    "before": {
      "status": "failed",
      "command": "bun test tests/generator/sqlite-path-typing.test.ts",
      "cwd": ".",
      "exit_code": 1,
      "assertion": "Native CLI accepts the generated graph without TS2345",
      "output": "evidence/001/runtime-before.log"
    },
    "after": {
      "status": "passed",
      "command": "bun test tests/generator/sqlite-path-typing.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Same native CLI accepts valid activatable graph with no diagnostics",
      "output": "evidence/001/runtime-after.log"
    }
  },
  "e2e": {
    "status": "passed",
    "command": "bun run test:generator",
    "cwd": ".",
    "exit_code": 0,
    "assertion": "Entire generator acceptance and native compilation cohorts pass",
    "output": "evidence/001/full-suite-results.jsonl"
  },
  "regressions": [
    {
      "status": "passed",
      "command": "bun test tests/generator/sqlite-state-path.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Missing/empty paths reject before acquisition; explicit nested state file returns SELECT 1 and closes",
      "output": "evidence/001/missing-after.log",
      "kind": "integration",
      "boundary": "Generated deferred callback -> native filesystem -> real Bun SQLite and Drizzle lifecycle"
    }
  ]
}
```

## Related reports

```json
[]
```

## Notes

```json
[]
```

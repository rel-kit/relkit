# bf-b328cbb4940a51006f15bbfb: Portable CRUD rejects native floating-point values

Status: **verified**
Attempt: 1 · Updated: 2026-10-05T12:07:59+00:00

## What

Portable CRUD rejects native floating-point values

## Expected

Native finite floating-point values insert and read unchanged

## Observed before

Generated schema rejects 1e20 accepted by SQLite

## Root cause

effectSchemasFor uses the pinned Drizzle rc.5 floating-point schemas with integer-sized limits, rejecting valid native float/double data before writes and after reads

## Fixed by

Refine signed/unsigned floating-point contracts to IEEE float32/float64 finite ranges, preserving generator null/default/update metadata and array dimensions

## Changed files

- packages/drizzle/src/table.schemas.ts
- packages/drizzle/tests/effect/floating-point.test.ts
- tests/integration/database/floating-point.test.ts
- tests/integration/database/generated-host-fixture.ts
- tests/integration/database/generated-host.test.ts
- apps/docs/content/docs/api/drizzle.mdx

## Reproduction

- rtk proxy bunx vitest run --config packages/drizzle/vitest.config.ts tests/effect/floating-point.test.ts
- rtk proxy bun test tests/integration/database/floating-point.test.ts

## Evidence

- before: [unit](evidence/001/unit-before.txt) —
- before: [integration](evidence/001/runtime-before.txt) —
- after: [unit](evidence/001/unit-after.txt) —
- after: [integration](evidence/001/runtime-after.txt) —
- after: [e2e](evidence/001/e2e.txt) —

## Scope

```json
{
  "modules": [
    "Drizzle schemas",
    "Drizzle CRUD",
    "Generated HTTP host"
  ],
  "entrypoints": [
    "DatabaseContext CRUD",
    "POST /records"
  ],
  "invariants": [
    "Native large finite floats preserve insert, update, persisted read values; malformed input does not mutate rows"
  ]
}
```

## Environment

```json
{
  "package": "packages/drizzle",
  "revision": "0dbc3c445664d53c79d54c3e3e69628f039e6842 plus reviewed specialized migration and these scoped fixes",
  "target": "Local Bun SQLite and generated HTTP host",
  "api_exposed": false,
  "e2e_available": true,
  "monitoring": "Existing specialized Effect operation logs inspected in local test output; no external monitoring queried"
}
```

## Verification

```json
{
  "unit": {
    "before": {
      "status": "failed",
      "command": "rtk proxy bunx vitest run --config packages/drizzle/vitest.config.ts tests/effect/floating-point.test.ts",
      "cwd": ".",
      "exit_code": 1,
      "assertion": "Native large finite floats preserve insert, update, persisted read values; malformed input does not mutate rows",
      "output": "evidence/001/unit-before.txt"
    },
    "after": {
      "status": "passed",
      "command": "rtk proxy bunx vitest run --config packages/drizzle/vitest.config.ts tests/effect/floating-point.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Native large finite floats preserve insert, update, persisted read values; malformed input does not mutate rows",
      "output": "evidence/001/unit-after.txt"
    }
  },
  "runtime": {
    "kind": "integration",
    "reason": "The affected entrypoint is a library activation/CRUD API; a native SQLite integration harness exercises its real adapters. Generated-host HTTP proof is additionally recorded as E2E.",
    "boundary": "Public Drizzle activation -> table schemas -> actual Bun SQLite CRUD",
    "dependencies": [
      "Actual local framework modules, pinned Effect and Drizzle packages",
      "Actual in-memory Bun SQLite; actual Better Auth SDK for authentication",
      "Schema-only PostgreSQL/MySQL unit coverage; no external database server"
    ],
    "steps": [
      "Native large finite floats preserve insert, update, persisted read values; malformed input does not mutate rows"
    ],
    "before": {
      "status": "failed",
      "command": "rtk proxy bun test tests/integration/database/floating-point.test.ts",
      "cwd": ".",
      "exit_code": 1,
      "assertion": "Native large finite floats preserve insert, update, persisted read values; malformed input does not mutate rows",
      "output": "evidence/001/runtime-before.txt"
    },
    "after": {
      "status": "passed",
      "command": "rtk proxy bun test tests/integration/database/floating-point.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Native large finite floats preserve insert, update, persisted read values; malformed input does not mutate rows",
      "output": "evidence/001/runtime-after.txt"
    }
  },
  "e2e": {
    "status": "passed",
    "command": "rtk proxy bun test tests/integration/database/generated-host.test.ts",
    "cwd": ".",
    "exit_code": 0,
    "assertion": "Generated HTTP host persists and reads -1e100 and completes nested auth initialization in a SQLite transaction; signup, session, rollback and shutdown remain valid",
    "output": "evidence/001/e2e.txt"
  },
  "checks": [
    {
      "name": "build",
      "status": "passed",
      "command": "rtk proxy bunx tsc -b packages/drizzle packages/better-auth --pretty false",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/build.txt"
    },
    {
      "name": "test-types",
      "status": "passed",
      "command": "rtk proxy bunx tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --types bun packages/drizzle/tests/effect/floating-point.test.ts packages/better-auth/tests/auth/reentrant-acquisition.test.ts tests/integration/database/floating-point.test.ts tests/integration/database/auth-reentrancy.test.ts tests/integration/database/generated-host-fixture.ts tests/integration/database/generated-host.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/test-types.txt"
    },
    {
      "name": "boundaries",
      "status": "passed",
      "command": "rtk proxy bun run check",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/boundaries.txt"
    },
    {
      "name": "lint",
      "status": "passed",
      "command": "rtk proxy bun run lint",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/lint.txt"
    },
    {
      "name": "public-types",
      "status": "passed",
      "command": "rtk proxy bun run test:types",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/public-types.txt"
    },
    {
      "name": "format",
      "status": "passed",
      "command": "rtk proxy bunx prettier --check affected source and test files",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/format.txt"
    },
    {
      "name": "docgen",
      "status": "passed",
      "command": "rtk proxy bun --eval scoped renderApi(drizzle, better-auth), format and write generated references",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/docgen.txt"
    },
    {
      "name": "guardrails",
      "status": "passed",
      "command": "rtk proxy bun test tests/phase0.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/guardrails.txt"
    },
    {
      "name": "drizzle-suite",
      "status": "passed",
      "command": "rtk proxy bunx vitest run --config packages/drizzle/vitest.config.ts",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/drizzle-suite.txt"
    },
    {
      "name": "auth-suite",
      "status": "passed",
      "command": "rtk proxy bunx vitest run packages/better-auth/tests/auth",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/auth-suite.txt"
    },
    {
      "name": "consumers",
      "status": "passed",
      "command": "rtk proxy bun test tests/integration/database packages/drizzle/tests/activation-contract.test.ts packages/better-auth/tests/service.test.ts packages/better-auth/tests/react.test.ts packages/cli/specialized-logging.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/consumers.txt"
    }
  ],
  "regressions": [
    {
      "kind": "integration",
      "boundary": "Database/auth -> native SQLite -> borrowed-owner shutdown",
      "status": "passed",
      "command": "rtk proxy bun test tests/integration/database/floating-point.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Native large finite floats preserve insert, update, persisted read values; malformed input does not mutate rows",
      "output": "evidence/001/runtime-after.txt"
    },
    {
      "kind": "e2e",
      "boundary": "Generated server HTTP routing -> function -> database/auth -> native SQLite",
      "status": "passed",
      "command": "rtk proxy bun test tests/integration/database/generated-host.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Generated HTTP host persists and reads -1e100 and completes nested auth initialization in a SQLite transaction; signup, session, rollback and shutdown remain valid",
      "output": "evidence/001/e2e.txt"
    }
  ],
  "limitations": [
    "External PostgreSQL/MySQL servers, full monorepo verify, Docker and cloud acceptance were not run for these scoped fixes.",
    "Upstream repos/effect lacks core Layer/ManagedRuntime/Schema sources; pinned installed sources and available upstream usages were checked."
  ]
}
```

## Related reports

```json
[
  "bf-9fb81e892db6930aa6072688"
]
```

## Notes

```json
[
  "Before unit and runtime assertions both failed on the original implementation; equivalent after scenarios passed.",
  "Generated-host fixture uses schema-validated optional output fields; initial fixture contract mismatch was corrected before successful HTTP replay."
]
```

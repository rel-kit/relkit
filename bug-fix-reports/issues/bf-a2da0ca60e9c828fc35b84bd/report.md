# bf-a2da0ca60e9c828fc35b84bd: Generated HTTP functions received an empty environment despite successful candidate environment resolution.

Status: **verified**
Attempt: 1 · Updated: 2026-10-15T21:08:47+00:00

## What

Generated HTTP functions received an empty environment despite successful candidate environment resolution.

## Expected

HTTP handlers receive their generation resolved environment, including defaults and refreshed dotenv values.

## Observed before

A repaired generation became active but its handler returned the fallback rather than the repaired value.

## Root cause

packages/cli/src/commands/build-server-invocation.ts invokeHttp omitted env from engine invoke options. packages/cli/src/commands/build-server-invocation.ts:18 now forwards the resolved values.

## Fixed by

Forward env: values into the generated HTTP invocation. The capturing generated-wiring regression failed before this edit and passes after it; both real CLI/HTTP matrices now return the resolved defaults and repaired values.

## Changed files

- packages/cli/src/commands/build-server-invocation.ts
- packages/cli/tests/services/dev-invocation-environment.test.ts

## Reproduction

- Run the generated minimal app with a function returning context.env.RECOVERY_VALUE.
- Add a required env contract, repair it through .env.local, and wait for a new generation to become active.
- Assert the HTTP response contains the repaired value; before the fix it remains the fallback despite successful activation.
- Run the same semantic HTTP assertion through both ordinary and prepared CLI modes after the fix.

## Evidence

- before: [api](evidence/001/context-before-runtime-after.txt) — Exact HTTP assertion fails after repaired generation activation.
- before: [unit](evidence/001/context-unit-before.txt) — Generated invocation captures undefined env before the edit.
- after: [api](evidence/001/runtime-final-after.txt) — Both real HTTP matrices pass all exact environment value assertions.
- after: [unit](evidence/001/context-unit-after.txt) — Generated invocation captures the resolved environment after the edit.
- after: [integration](evidence/001/full-suite-summary.json) — All local suite stages and final guardrails pass after additional fixture/manual watcher repairs.

## Scope

```json
{
  "modules": [
    "CLI generated HTTP server",
    "engine invocation",
    "public function context"
  ],
  "entrypoints": [
    "HTTP GET /recovery",
    "generated invokeHttp"
  ],
  "invariants": [
    "HTTP functions receive the schema-resolved generation environment",
    "Runtime values are not embedded in generated graph or snapshot metadata"
  ]
}
```

## Environment

```json
{
  "package": "packages/cli",
  "revision": "ebc3a2544 plus local uncommitted invocation environment fix",
  "target": "macOS, Bun 1.3.10; real generated minimal app HTTP handler; processes stopped",
  "api_exposed": true,
  "e2e_available": true,
  "monitoring": "Real CLI activation/provider diagnostics, generated HTTP runtime logs and exact response-body assertions; no remote telemetry."
}
```

## Verification

```json
{
  "unit": {
    "before": {
      "status": "failed",
      "command": "rtk bun test packages/cli/tests/services/dev-invocation-environment.test.ts",
      "cwd": ".",
      "exit_code": 1,
      "assertion": "Generated invocation passes resolved values to the engine",
      "output": "evidence/001/context-unit-before.txt"
    },
    "after": {
      "status": "passed",
      "command": "rtk bun test packages/cli/tests/services/dev-invocation-environment.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Generated invocation passes the same resolved environment object",
      "output": "evidence/001/context-unit-after.txt"
    }
  },
  "runtime": {
    "kind": "api",
    "boundary": "GET /recovery -> generated invokeHttp -> engine -> context.env -> actual function handler",
    "dependencies": [
      "Real generated server, engine invocation and native HTTP transport",
      "Actual validated app environment and Bun candidate process"
    ],
    "steps": [
      "Reject missing value while previous traffic remains available",
      "Repair file and wait for new generation activation",
      "Assert exact handler body equals repaired env value",
      "Repeat in ordinary and prepared modes with edits, removals, defaults and invalid values"
    ],
    "before": {
      "status": "failed",
      "command": "rtk nice -n 10 bun packages/cli/tests/dev-environment/recovery.probe.ts /var/folders/54/3l8wd4hj6c36slgt3rl572sr0000gp/T/relkit-dev-recovery-7uwlmdbu/app bug-fix-reports/issues/bf-dd7ddbd6f31a6ea12ef97ce5/evidence/001",
      "cwd": ".",
      "exit_code": 1,
      "assertion": "HTTP handler returns the repaired environment value",
      "output": "evidence/001/context-before-runtime-after.txt"
    },
    "after": {
      "status": "passed",
      "command": "rtk nice -n 10 bun packages/cli/tests/dev-environment/recovery.probe.ts /var/folders/54/3l8wd4hj6c36slgt3rl572sr0000gp/T/relkit-dev-recovery-7uwlmdbu/app bug-fix-reports/issues/bf-dd7ddbd6f31a6ea12ef97ce5/evidence/001/final",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "HTTP handlers return resolved defaults and all repaired values",
      "output": "evidence/001/runtime-final-after.txt"
    }
  },
  "e2e": {
    "status": "passed",
    "command": "rtk nice -n 10 bun packages/cli/tests/dev-environment/recovery.probe.ts /var/folders/54/3l8wd4hj6c36slgt3rl572sr0000gp/T/relkit-dev-recovery-7uwlmdbu/app bug-fix-reports/issues/bf-dd7ddbd6f31a6ea12ef97ce5/evidence/001/final",
    "cwd": ".",
    "exit_code": 0,
    "assertion": "Both actual CLI/HTTP matrices pass",
    "output": "evidence/001/runtime-final-after.txt"
  },
  "checks": [
    {
      "name": "CLI typecheck",
      "status": "passed",
      "command": "rtk nice -n 10 bun node_modules/typescript/bin/tsc -p packages/cli/tsconfig.json --noEmit --composite false --incremental false",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/cli-typecheck-final.txt"
    },
    {
      "name": "supervisor typecheck",
      "status": "passed",
      "command": "rtk nice -n 10 bun node_modules/typescript/bin/tsc -p packages/supervisor/tsconfig.json --noEmit --composite false --incremental false",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/supervisor-typecheck-final.txt"
    },
    {
      "name": "formatting",
      "status": "passed",
      "command": "rtk bun x prettier --check packages/cli/src/commands/dev-environment-files.ts packages/cli/src/commands/build-server-invocation.ts packages/cli/src/commands/dev-watch.ts packages/cli/src/dev-snapshot/snapshot-epoch-path.ts packages/cli/src/services/dev-environment* packages/cli/src/services/dev-supervisor.service.ts packages/cli/tests/services/dev-environment* packages/cli/tests/services/dev-invocation-environment.test.ts packages/cli/tests/services/source-watch* packages/cli/tests/dev-environment packages/supervisor/src/candidate-process.ts packages/supervisor/tests/compatibility/environment.test.ts apps/docs/content/docs/fundamentals/environment.mdx .changeset/dev-environment-recovery.md",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/format-after.txt"
    },
    {
      "name": "package boundaries",
      "status": "passed",
      "command": "rtk nice -n 10 bun run check",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/boundaries-after.txt"
    },
    {
      "name": "complete local suite after additional recovery repairs",
      "status": "passed",
      "command": "All scripts/test-all.ts local stages run serially with bounded nested workers, followed by final build, certification and guardrails",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/full-suite-summary.json"
    }
  ],
  "regressions": [
    {
      "kind": "integration",
      "boundary": "snapshot/candidate publication and integrity",
      "status": "passed",
      "command": "rtk nice -n 10 bun x vitest run --maxWorkers=1 packages/cli/tests/dev-snapshot/validation.test.ts packages/cli/tests/dev-snapshot/files.test.ts packages/cli/tests/dev-snapshot/stale-command.test.ts packages/cli/tests/dev-snapshot/prepared-plan.test.ts packages/cli/tests/dev-snapshot/readiness-requests.test.ts packages/supervisor/tests/candidate/service.test.ts packages/supervisor/tests/activation/service.test.ts packages/supervisor/tests/activation/state-machine.test.ts packages/supervisor/tests/watcher/service.test.ts packages/supervisor/tests/proxy/service.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "44 snapshot/supervisor tests pass",
      "output": "evidence/001/snapshot-supervisor-after.txt"
    },
    {
      "kind": "api",
      "boundary": "ordinary and prepared actual handler invocation",
      "status": "passed",
      "command": "rtk nice -n 10 bun packages/cli/tests/dev-environment/recovery.probe.ts /var/folders/54/3l8wd4hj6c36slgt3rl572sr0000gp/T/relkit-dev-recovery-7uwlmdbu/app bug-fix-reports/issues/bf-dd7ddbd6f31a6ea12ef97ce5/evidence/001/final",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Old traffic survives rejected candidates and newest validated code and env activate",
      "output": "evidence/001/runtime-final-after.txt"
    }
  ],
  "limitations": [
    "Verified locally on macOS with Bun 1.3.10; no hosted CI or production deployment was performed.",
    "Every local full-suite stage now passes. Existing Docker/cloud/provider and platform-specific tests retain their declared opt-in skips; hosted CI was not run. The reproduced fixes do not establish the cause of every historical lockup."
  ]
}
```

## Related reports

```json
[
  "bf-dd7ddbd6f31a6ea12ef97ce5",
  "bf-6c16eaa4c0d654629db8b963",
  "bf-a561f569dacbef352f9ffb95"
]
```

## Notes

```json
[
  "Independent defect discovered while verifying the original reload issue; the failing API and unit outputs were preserved before the application edit.",
  "The custom HTTP probe uses /recovery for complete graph readiness verification; the scaffold-only /hello greeting certification remains intact.",
  "Changes remain uncommitted; all owned runtime processes stopped."
]
```

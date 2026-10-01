# bf-cf7dd657070a0c1bc95c3060: Inferred users/[id] routes accepted a function without id input; the demo response omitted id and a framework restart later stalled.

Status: **unverified**
Attempt: 1 · Updated: 2026-10-01T09:27:22+00:00

## What

Inferred users/[id] routes accepted a function without id input; the demo response omitted id and a framework restart later stalled.

## Expected

An inferred dynamic route rejects missing input fields. The demo returns declared id output. A local framework rebuild stops the previous dev session and serves the new generation.

## Observed before

The real CLI accepted the missing path field, output validation removed undeclared id, and a framework restart left the proxy/backend stopped while inspector and telemetry children remained alive.

## Root cause

normalize-route-inference.ts:89 silently continued when a path field was absent. The generated route contract and editor did not carry filename path parameters. The demo's output schema declared only value despite returning id. dev-shutdown.ts:13 awaited proxy closure before stopping the inspector that could keep proxy requests active.

## Fixed by

Require inferred path fields during normalization, generated TypeScript route contracts and editor diagnostics, preserving explicit mapping overrides. Added id to the demo output schema. Stop the proxy and inspector concurrently. Focused tests, actual CLI rejection, live response, and real framework restart pass. Full-repository verification remains unverified because the required boundary check fails on an existing compiler coverage artifact.

## Changed files

- packages/compiler/src/normalize-route-inference.ts
- packages/routes/src/define-service-routes.types.ts
- packages/routes/src/route-module.types.ts
- packages/compiler/src/route-path-parameters.ts
- packages/compiler/src/route-module-checks.ts
- packages/compiler/src/route-path-input-checks.ts
- packages/compiler/src/route-module-diagnostics.ts
- packages/cli/src/commands/dev-shutdown.ts
- packages/cli/dev-shutdown.test.ts
- packages/cli/route-path-input.test.ts
- tests/types/route-path-input.ts
- tests/compiler/route-path-input.test.ts
- tests/compiler/route-path-types.test.ts
- tests/compiler/route-inference.test.ts
- docs/records/route-module-type-safety.md

## Reproduction

- Generate a minimal app, export a users function whose input has value but no id, and connect it using defineServiceRoutes in src/routes/users/[id]/route.ts.
- Run the actual CLI check subprocess and assert it exits 1 with RELKIT_MAPPING_INCOMPATIBLE. Before the change it exited 0.
- Request GET /_relkit/backend/users/probe-user?value=probe-value through the existing inspector; compare id output before and after declaring id in the output schema.
- Change local framework source with the user's framework watcher running; assert the old dev process exits and the same proxy endpoint returns the expected body.

## Evidence

- before: [unit](evidence/001/unit-before.txt) — Missing path input normalized as activatable.
- before: [integration](evidence/001/cli-before.txt) — Actual CLI subprocess accepted missing id.
- before: [api](evidence/001/api-before.json) — Output validation stripped id; this was not stale source.
- before: [unit](evidence/001/shutdown-before.txt) — Sequential shutdown did not reach inspector stop.
- before: [api](evidence/001/runtime-shutdown-before.txt) — Observed stuck old dev process, proxy 500 and telemetry lock.
- after: [unit](evidence/001/unit-after.txt) — Missing inferred path input rejected.
- after: [integration](evidence/001/cli-after.txt) — Actual CLI subprocess rejects the invalid route.
- after: [api](evidence/001/api-after.json) — Declared id returned following live source reload without restart.
- after: [unit](evidence/001/shutdown-after.txt) — Concurrent shutdown regression and existing dev tests pass.
- after: [api](evidence/001/runtime-shutdown-after.json) — Existing framework watcher completed restart and the same API returned current id.

## Scope

```json
{
  "modules": [
    "Compiler route inference",
    "RouteModuleContract",
    "CLI editor diagnostics",
    "CLI development shutdown",
    "Demo users function"
  ],
  "entrypoints": [
    "relkit check",
    "Generated TypeScript validator",
    "Editor route diagnostics",
    "GET /users/:id",
    "Local framework watcher restart"
  ],
  "invariants": [
    "Inferred filename path parameters must appear in target input keys",
    "Explicit mappings can rename or omit parameters",
    "Declared output fields survive validation",
    "Shutdown can stop request producers while draining requests"
  ]
}
```

## Environment

```json
{
  "package": "@relkit/compiler, @relkit/routes, @relkit/cli",
  "revision": "9870d832cbb75e70a81f88f0f119058db6fcbde7 plus preserved staged work and this local patch",
  "target": "Local generated demo; backend 127.0.0.1:3000 and inspector proxy 127.0.0.1:3210",
  "api_exposed": true,
  "e2e_available": true,
  "monitoring": "Existing local development logging and DuckDB telemetry writer. Observed RELKIT_DEV_TELEMETRY_LOCKED during the stuck old session; no external error tracker configured in the demo."
}
```

## Verification

```json
{
  "unit": {
    "before": {
      "status": "failed",
      "command": "rtk bun test tests/compiler/route-path-input.test.ts",
      "cwd": ".",
      "exit_code": 1,
      "assertion": "Missing inferred path input is not activatable",
      "output": "evidence/001/unit-before.txt"
    },
    "after": {
      "status": "passed",
      "command": "rtk bun test tests/compiler/route-path-input.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Missing inferred path input is not activatable",
      "output": "evidence/001/unit-after.txt"
    }
  },
  "runtime": {
    "kind": "api",
    "boundary": "Inspector proxy -> backend HTTP route -> users service function -> output schema",
    "dependencies": [
      "Actual running generated application and installed local framework packages",
      "Actual inspector proxy; no mocked HTTP transport"
    ],
    "steps": [
      "Request the same users path and value",
      "Assert HTTP 200, value and id",
      "Declare id output and replay without restarting the server"
    ],
    "before": {
      "status": "failed",
      "command": "rtk bun -e 'const r=await fetch(\"http://127.0.0.1:3210/_relkit/backend/users/probe-user?value=probe-value\");const b=await r.json();if(r.status!==200||b.id!==\"probe-user\")process.exit(1);'",
      "cwd": ".",
      "exit_code": 1,
      "assertion": "Users response contains the requested id",
      "output": "evidence/001/api-before.json"
    },
    "after": {
      "status": "passed",
      "command": "rtk bun -e 'const r=await fetch(\"http://127.0.0.1:3210/_relkit/backend/users/probe-user?value=probe-value\");const b=await r.json();if(r.status!==200||b.id!==\"probe-user\")process.exit(1);'",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Users response contains the requested id",
      "output": "evidence/001/api-after.json"
    }
  },
  "e2e": {
    "status": "passed",
    "command": "rtk bun test packages/cli/route-path-input.test.ts",
    "cwd": ".",
    "exit_code": 0,
    "assertion": "Generated app actual CLI subprocess rejects an inferred users route missing id",
    "output": "evidence/001/cli-after.txt"
  },
  "checks": [
    {
      "name": "Public type fixtures",
      "status": "passed",
      "command": "rtk bun run test:types",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/type-fixtures.txt"
    },
    {
      "name": "Routes package tests",
      "status": "passed",
      "command": "rtk bun x vitest run packages/routes/tests",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/routes-tests.txt"
    },
    {
      "name": "Lint",
      "status": "passed",
      "command": "rtk bun run lint",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/lint.txt"
    },
    {
      "name": "Formatting",
      "status": "passed",
      "command": "rtk bun x prettier --check <changed path-input files> docs/records/route-module-type-safety.md",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/format.txt"
    },
    {
      "name": "Repository boundary check",
      "status": "failed",
      "command": "rtk bun run check",
      "cwd": ".",
      "exit_code": 1,
      "output": "evidence/001/root-check.txt",
      "reason": "Existing compiler coverage JSON triggers out-of-scope-navigation-name; left intact as unrelated user-owned output."
    }
  ],
  "regressions": [
    {
      "kind": "integration",
      "boundary": "Built public declarations -> generated validator -> editor diagnostics; explicit mappings",
      "status": "passed",
      "command": "rtk bun test tests/compiler/route-path-types.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Missing id fails installed types and editor diagnostics; explicit renamed mapping succeeds",
      "output": "evidence/001/focused-tests.txt"
    },
    {
      "kind": "integration",
      "boundary": "Generated application -> real CLI compiler",
      "status": "passed",
      "command": "rtk bun test packages/cli/route-path-input.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Invalid inferred path is rejected through actual CLI",
      "output": "evidence/001/cli-after.txt"
    },
    {
      "kind": "api",
      "boundary": "Inspector proxy -> route -> users function output",
      "status": "passed",
      "command": "rtk bun -e 'const r=await fetch(\"http://127.0.0.1:3210/_relkit/backend/users/probe-user?value=probe-value\");const b=await r.json();if(r.status!==200||b.id!==\"probe-user\"||b.value!==\"probe-value\")process.exit(1);const a=await fetch(\"http://127.0.0.1:3210/_relkit/backend/users\");if(a.status!==404)process.exit(1);'",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Current response includes id and value; absent required path does not invoke the function and returns 404",
      "output": "evidence/001/api-boundaries.json"
    }
  ],
  "limitations": [
    "The required root boundary check remains failing. Baseline/current coverage artifacts were not archived as an independent pre-existing-check exemption, so this report stays unverified at the repository level.",
    "The combined original symptom had separate causes: CLI authoring acceptance, schema output projection, and framework shutdown. The route unit/CLI evidence proves authoring rejection; API evidence proves output correction; shutdown unit and actual watcher restart prove lifecycle recovery. The API pair is not proof of a compiler diagnostic.",
    "Editor sessions must use workspace TypeScript and restart the TypeScript server to reload the rebuilt plugin.",
    "Functions/services do not require fields solely because a separate route filename uses them; the error is reported at that route wiring boundary.",
    "Local telemetry access was limited to dev diagnostics, process ownership and the lock failure; no external ingestion or dashboard claims were made.",
    "No cloud or Docker checks were run."
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
  "Only the demo function output schema was changed: /Users/mustafaelsayed/Workspace/typescripts/relkit-demo-4/src/users/functions/example.function.ts now declares id alongside value.",
  "Root typecheck, compiler/routes/CLI typechecks, demo check and backend/frontend typechecks passed during this attempt. Focused compiler/editor/CLI suite passed 22 tests; dev suite passed 13; routes Vitest passed 35.",
  "The existing user's framework watcher remains running, with API and inspector available.",
  "Protected staged compiler migration and unrelated dirty files were preserved; no staging, commit or push performed."
]
```

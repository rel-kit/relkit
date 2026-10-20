# bf-7f526e3acf6ba0725c7b9d36: Valid numeric dotenv settings caused database startup failure and prevented new routes from activating.

Status: **verified**
Attempt: 1 · Updated: 2026-10-20T18:21:19+00:00

## What

Valid numeric dotenv settings caused database startup failure and prevented new routes from activating.

## Expected

Declared environment values supplied by dotenv or process.env are decoded before entering application code.

## Observed before

Generated HTTP runtime returned string:7:string:false:false rather than number:7:boolean:false:true.

## Root cause

packages/cli/src/commands/build-server-runtime-support.ts:125 skipped every resolved value already present in the raw source. As a result numeric and boolean values stayed strings and URL values stayed text, despite resolveEnv decoding them successfully. Database client Number.isInteger checks therefore rejected valid retention settings.

## Fixed by

Always merge resolved declared values into the runtime environment, preserving undeclared source keys and validation failures. A real generated HTTP backend reproduces the original failure and passes after the one-line correction. Both ordinary and prepared same-PID reload recovery are verified; the restarted real app serves 34 application OpenAPI paths plus 30 auth paths.

## Changed files

- packages/cli/src/commands/build-server-runtime-support.ts
- packages/cli/environment-runtime.test.ts
- tests/unit/runtime-environment-values.test.ts

## Reproduction

- Build a minimal app declaring a number, boolean and URL.
- Start the emitted server with raw strings from environment source.
- Request /hello/probe and assert decoded runtime types.
- Run the same regression after correcting the generated environment merge.

## Evidence

- before: [api](evidence/001/api-before.txt) — Real HTTP response returned raw strings.
- before: [unit](evidence/001/unit-before.txt) — Declared 7 was returned as a string.
- after: [api](evidence/001/api-after.txt) — Real generated server decodes values; missing production secret still rejects.
- after: [unit](evidence/001/unit-after.txt) — Decoded values and invalid input boundary pass.

## Scope

```json
{
  "modules": [
    "CLI generated server runtime",
    "Config resolveEnv",
    "Application invocation context",
    "Drizzle database client environment"
  ],
  "entrypoints": [
    "relkit dev",
    "relkit build",
    "relkit start",
    "GET /hello/probe"
  ],
  "invariants": [
    "Supplied declared numbers, booleans and URLs match their declared runtime types.",
    "Undeclared environment keys and defaults remain available.",
    "Invalid and missing required environment still reject startup."
  ]
}
```

## Environment

```json
{
  "package": "packages/cli",
  "revision": "843ffa246b501c3be585444aeb9b71a977322b90 plus local runtime environment correction",
  "target": "Disposable built minimal application on a test-owned dynamic loopback port",
  "api_exposed": true,
  "e2e_available": true,
  "monitoring": "Existing CLI structured logs and generated runtime lifecycle logs identified retention startup failure. The test uses actual buildProject, startProject, HTTP routing and application functions."
}
```

## Verification

```json
{
  "unit": {
    "before": {
      "command": "bun test packages/cli/tests/services/runtime-environment-values.test.ts --max-concurrency 1",
      "cwd": ".",
      "exit_code": 1,
      "status": "failed",
      "assertion": "Declared number values supplied as text reach the runtime as numbers.",
      "output": "evidence/001/unit-before.txt"
    },
    "after": {
      "command": "bun run test:unit --max-concurrency 1",
      "cwd": ".",
      "exit_code": 0,
      "status": "passed",
      "assertion": "Numbers, booleans, URLs, defaults and undeclared values retain their contracts; invalid values still fail.",
      "output": "evidence/001/unit-gate.txt"
    }
  },
  "runtime": {
    "kind": "api",
    "boundary": "buildProject -> emitted server -> startProject -> HTTP route -> application function -> invocation env",
    "dependencies": [
      "Actual compiler/config/runtime packages and Bun HTTP server; no external provider or mock environment parser."
    ],
    "steps": [
      "Build the disposable minimal app.",
      "Start the generated backend on a dynamic port.",
      "Assert /hello/probe body and join child shutdown."
    ],
    "before": {
      "command": "bun test packages/cli/environment-runtime.test.ts --test-name-pattern \"decoded dotenv\" --max-concurrency 1",
      "cwd": ".",
      "exit_code": 1,
      "status": "failed",
      "assertion": "Actual generated HTTP response contains number:7:boolean:false:true.",
      "output": "evidence/001/api-before.txt"
    },
    "after": {
      "command": "bun test packages/cli/environment-runtime.test.ts --max-concurrency 1",
      "cwd": ".",
      "exit_code": 0,
      "status": "passed",
      "assertion": "Actual generated HTTP response contains number:7:boolean:false:true and missing production environment is rejected.",
      "output": "evidence/001/api-after.txt"
    }
  },
  "e2e": {
    "command": "bun test packages/cli/environment-runtime.test.ts --max-concurrency 1",
    "cwd": ".",
    "exit_code": 0,
    "status": "passed",
    "assertion": "Actual generated HTTP response contains number:7:boolean:false:true and missing production environment is rejected.",
    "output": "evidence/001/api-after.txt"
  },
  "regressions": [
    {
      "command": "bun test packages/cli/environment-runtime.test.ts --max-concurrency 1",
      "cwd": ".",
      "exit_code": 0,
      "status": "passed",
      "assertion": "Actual generated HTTP response contains number:7:boolean:false:true and missing production environment is rejected.",
      "output": "evidence/001/api-after.txt",
      "kind": "api",
      "boundary": "Generated production server environment -> startup readiness"
    },
    {
      "command": "bun run test:unit --max-concurrency 1",
      "cwd": ".",
      "exit_code": 0,
      "status": "passed",
      "assertion": "Numbers, booleans, URLs, defaults and undeclared values retain their contracts; invalid values still fail.",
      "output": "evidence/001/unit-gate.txt",
      "kind": "integration",
      "boundary": "Emitted environment resolver -> actual Config resolveEnv"
    },
    {
      "kind": "e2e",
      "boundary": "Actual source CLI -> retained old generation -> repaired typed runtime -> HTTP/OpenAPI -> source Inspector",
      "command": "bun run test:inspector:recovery",
      "cwd": ".",
      "exit_code": 0,
      "status": "passed",
      "assertion": "ordinary startup preserves the same dev PID through invalid env rejection and recovers number:30 and the new route without page refresh.",
      "output": "evidence/001/recovery/ordinary/result.json"
    },
    {
      "kind": "e2e",
      "boundary": "Actual source CLI -> retained old generation -> repaired typed runtime -> HTTP/OpenAPI -> source Inspector",
      "command": "bun run test:inspector:recovery",
      "cwd": ".",
      "exit_code": 0,
      "status": "passed",
      "assertion": "prepared startup preserves the same dev PID through invalid env rejection and recovers number:30 and the new route without page refresh.",
      "output": "evidence/001/recovery/prepared/result.json"
    }
  ],
  "checks": [
    {
      "name": "boundaries",
      "command": "bun run check",
      "cwd": ".",
      "status": "passed",
      "exit_code": 0,
      "output": "evidence/001/boundaries.txt"
    },
    {
      "name": "lint",
      "command": "bun run lint",
      "cwd": ".",
      "status": "passed",
      "exit_code": 0,
      "output": "evidence/001/lint.txt"
    },
    {
      "name": "format",
      "command": "bun x prettier --check affected files",
      "cwd": ".",
      "status": "passed",
      "exit_code": 0,
      "output": "evidence/001/format.txt"
    }
  ],
  "limitations": [
    "Changes are local and unpublished; full repository acceptance/release packaging were not run.",
    "Standalone Scalar reference HTML is outside the Inspector shell.",
    "Focused strict TypeScript comparison retains the same 10 pre-existing dependency errors with no introduced errors.",
    "The source Inspector startup deadline is now fixed and verified with CLI-owned startup and recovery; see related report bf-3da7c773d109b45a19e71179."
  ]
}
```

## Related reports

```json
[
  "bf-3da7c773d109b45a19e71179"
]
```

## Notes

```json
[
  "100 unit tests and 69 focused tests passed. New fast regressions live in the existing merge-blocking unit gate; browser recovery is chained into test:inspector:browser.",
  "Disposable ordinary and prepared apps, their Inspector processes, browsers, listeners, and owned descendants were joined and removed.",
  "Docker became unavailable again before restart; reopened Docker, then confirmed docker ps and application startup succeeded. No authored app files or persisted data were deleted.",
  "Superseding live verification: source CLI PID 90959 owns both backend and Inspector on 3000/3210. The separate Inspector was stopped. The live proxy and backend expose matching 34 application plus 30 auth paths. Stop the authorized dev owner with kill -TERM 90959. See bf-3da7c773d109b45a19e71179 for current process proof."
]
```

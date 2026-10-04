# bf-031aa0d1c73949676bc9eaa3: Automatic RPC clients rejected synchronous WebSocket constructor failures instead of selecting HTTP.

Status: **verified**
Attempt: 1 · Updated: 2026-10-04T01:49:41+00:00

## What

Automatic RPC clients rejected synchronous WebSocket constructor failures instead of selecting HTTP.

## Expected

Failed socket construction selects HTTP once, while direct socket establishment retains the original failure.

## Observed before

SecurityError became an Effect defect and prevented any HTTP request.

## Root cause

packages/client/src/transport-socket.ts:33 constructed WebSocket inside Effect.callback without translating synchronous exceptions into its typed error channel; selectAutoTransport catches typed failures only.

## Fixed by

Catch only constructor exceptions and resume with Effect.fail(cause). Public client replay reaches a real loopback HTTP server twice, reuses selection, and retains direct constructor-error identity; 34 Effect tests and 46 compatibility tests pass.

## Changed files

- packages/client/src/transport-socket.ts
- packages/client/tests/transport/selection.test.ts
- packages/client/tests/transport/native.test.ts
- packages/client/tests/native/auto-fallback-fixture.ts

## Reproduction

- Inject a constructor throwing SecurityError through the supported websocket option
- Create the public auto client against an actual loopback HTTP listener
- Call ping and assert its decoded response
- Call again and assert only one socket construction and two real HTTP requests

## Evidence

- before: [unit](evidence/001/unit-before.txt) — Typed-failure assertion fails on the original implementation.
- before: [integration](evidence/001/runtime-before.txt) — Public auto client rejects before actual HTTP dispatch.
- after: [unit](evidence/001/client-tests.txt) — 34 tests pass including typed failure and native transport replay.
- after: [integration](evidence/001/runtime-after-final.txt) — Real HTTP results, lazy shared selection, direct error identity and telemetry outcomes pass.

## Scope

```json
{
  "modules": [
    "ClientTransport",
    "connectSocketEffect",
    "oRPC HTTP link"
  ],
  "entrypoints": [
    "createAutoClient",
    "connectSocket"
  ],
  "invariants": [
    "Socket construction failure permits automatic HTTP fallback",
    "Selection remains lazy and shared",
    "Direct establishment retains original rejection",
    "Pending socket cancellation and stream cleanup remain intact"
  ]
}
```

## Environment

```json
{
  "package": "packages/client",
  "revision": "0882d7069f80c1a961b672e3ba09f74cfabea2ac plus scoped local fix",
  "target": "Bun 1.3.10 loopback server on an ephemeral port, installed Effect 4.0.0-rc.115",
  "api_exposed": false,
  "e2e_available": true,
  "monitoring": "Existing observeExecution structured console logs and metrics; runtime replay records constructor failure as typed failure and both HTTP invocations as success. No external monitoring required."
}
```

## Verification

```json
{
  "unit": {
    "before": {
      "status": "failed",
      "command": "rtk bun x vitest run --config packages/client/vitest.config.ts tests/transport/selection.test.ts",
      "cwd": ".",
      "exit_code": 1,
      "assertion": "Constructor exceptions are typed failures retaining their identity",
      "output": "evidence/001/unit-before.txt"
    },
    "after": {
      "status": "passed",
      "command": "rtk bun x vitest run --config packages/client/vitest.config.ts --maxWorkers=1",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Constructor exceptions are typed failures retaining their identity",
      "output": "evidence/001/client-tests.txt"
    }
  },
  "runtime": {
    "kind": "integration",
    "reason": "The affected entrypoint is a client transport selector rather than a server API; exercise its public RPC client over actual native HTTP.",
    "boundary": "createAutoClient -> ClientTransport -> socket construction -> actual oRPC HTTP adapter -> native loopback server -> decoded result",
    "dependencies": [
      "Actual Effect owner and oRPC/native fetch modules",
      "Actual Bun HTTP listener",
      "Injected constructor reproduces the synchronous browser policy error; browser policy itself is not tested"
    ],
    "steps": [
      "Allocate an ephemeral native HTTP listener",
      "Invoke public auto-client ping twice",
      "Assert result and shared selection counts",
      "Assert original direct connection error and stop listener"
    ],
    "before": {
      "status": "failed",
      "command": "rtk bun packages/client/tests/native/auto-fallback-fixture.ts",
      "cwd": ".",
      "exit_code": 1,
      "assertion": "Automatic transport returns the actual HTTP result when socket construction fails",
      "output": "evidence/001/runtime-before.txt"
    },
    "after": {
      "status": "passed",
      "command": "rtk bun packages/client/tests/native/auto-fallback-fixture.ts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Automatic transport returns the actual HTTP result when socket construction fails",
      "output": "evidence/001/runtime-after-final.txt"
    }
  },
  "e2e": {
    "status": "passed",
    "command": "rtk bun x vitest run --config packages/client/vitest.config.ts --maxWorkers=1",
    "cwd": ".",
    "exit_code": 0,
    "assertion": "Native subprocess harness verifies public client HTTP fallback and existing real pending-pull return/throw/abort cleanup",
    "output": "evidence/001/client-tests.txt"
  },
  "regressions": [
    {
      "kind": "integration",
      "boundary": "Public client -> native HTTP and direct connection edge",
      "status": "passed",
      "command": "rtk bun packages/client/tests/native/auto-fallback-fixture.ts",
      "cwd": ".",
      "exit_code": 0,
      "assertion": "Lazy shared fallback serves two decoded HTTP results and direct connection retains original exception",
      "output": "evidence/001/runtime-after-final.txt"
    }
  ],
  "checks": [
    {
      "name": "client typecheck/build",
      "status": "passed",
      "command": "rtk bun run --cwd packages/client typecheck",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/typecheck.txt"
    },
    {
      "name": "client compatibility",
      "status": "passed",
      "command": "rtk bun test packages/client/tests/compatibility",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/compatibility.txt"
    },
    {
      "name": "repository boundaries",
      "status": "passed",
      "command": "rtk bun run check",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/check.txt"
    },
    {
      "name": "lint",
      "status": "passed",
      "command": "rtk bun run lint",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/lint.txt"
    },
    {
      "name": "changed file formatting",
      "status": "passed",
      "command": "rtk bun x prettier --check packages/client/src/transport-socket.ts packages/client/tests/transport/selection.test.ts packages/client/tests/transport/native.test.ts packages/client/tests/native/auto-fallback-fixture.ts",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/format.txt"
    }
  ],
  "limitations": [
    "Browser SecurityError is injected at the supported constructor seam; actual browser security policy is outside this transport regression.",
    "Full repository acceptance was not repeated for this scoped fix."
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
  "Sparse repos/effect lacks core implementation/tests; checked installed rc.115 callback source. No dependency changes.",
  "The initial adjacent WebSocket SDK probe retries by design; replaced it with direct establishment identity proof and stopped its owned process."
]
```

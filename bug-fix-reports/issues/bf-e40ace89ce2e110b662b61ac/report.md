# bf-e40ace89ce2e110b662b61ac: Invalid agent payload is classified BAD_REQUEST but sent as HTTP 500.

Status: **verified**
Attempt: 1 · Updated: 2026-10-02T23:38:55+00:00

## What

Invalid agent payload is classified BAD_REQUEST but sent as HTTP 500.

## Expected

Reject invalid input with HTTP 400 and no accepted run.

## Observed before

Payload {} returned BAD_REQUEST / HTTP 500.

## Root cause

createRpcRouter supplied a custom errorStatusMap without COMMON_ERROR_STATUS_MAP. oRPC treats that map as a replacement, so unmapped standard errors defaulted to 500.

## Fixed by

Merge oRPC standard error statuses before configured domain overrides. Same real API reproduction and regression tests now pass.

## Changed files

- packages/runtime-hono/src/rpc.ts
- packages/runtime-hono/tests/rpc-error-status.test.ts
- tests/e2e-commerce/generated-ai-regressions.spec.ts

## Reproduction

- Start retained fixture on 3330/3331 without RELKIT_ALLOWED_ORIGINS.
- rtk bun scripts/verify-generated-ai.mjs
- Use fresh thread/operation IDs and channel topics; pull lazy iterators.

## Evidence

- before: [api](evidence/001/api-before.txt) —
- after: [api](evidence/001/api-after.txt) —
- after: [api](evidence/001/demo-agent-after.txt) —
- after: [api](evidence/001/luna.txt) —
- after: [integration](evidence/001/demo-native-luna.json) —

## Scope

```json
{
  "modules": [
    "supervisor",
    "client",
    "runtime-hono",
    "engine",
    "providers-local"
  ],
  "entrypoints": [
    "rtk bun scripts/verify-generated-ai.mjs"
  ],
  "invariants": [
    "Reject invalid input with HTTP 400 and no accepted run.",
    "Foreign origins remain rejected; successful tools and event streams retain their contracts."
  ]
}
```

## Environment

```json
{
  "package": "CLI-generated agent starter",
  "revision": "56cb00a4e09f7908d456848e69f6b623bd859c84 plus existing dirty checkout and scoped repair",
  "target": "http://127.0.0.1:3330",
  "api_exposed": true,
  "e2e_available": true,
  "dependencies": "Actual CLI builder, supervisor proxy, engine, Hono/oRPC, local persistence and public client. Offline LangChain models for deterministic regression; gpt-6-luna used separately."
}
```

## Verification

```json
{
  "unit": {
    "before": {
      "status": "failed",
      "command": "rtk bun x vitest run packages/runtime-hono/tests/rpc-error-status.test.ts packages/runtime-hono/tests/realtime-rpc.test.ts",
      "cwd": ".",
      "exit_code": 1,
      "output": "evidence/001/unit-before.txt",
      "assertion": "Invalid agent input is rejected as BAD_REQUEST / HTTP 400; valid tool invocation persists output and remains idempotent."
    },
    "after": {
      "status": "passed",
      "command": "rtk bun x vitest run packages/runtime-hono/tests/rpc-error-status.test.ts packages/runtime-hono/tests/realtime-rpc.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/unit-after.txt",
      "assertion": "Invalid agent input is rejected as BAD_REQUEST / HTTP 400; valid tool invocation persists output and remains idempotent."
    }
  },
  "runtime": {
    "kind": "api",
    "boundary": "CLI public proxy -> actual transport/engine/local providers -> persisted state or presence",
    "dependencies": [
      "Actual CLI-generated server",
      "Actual public HTTP/WebSocket clients",
      "Actual local providers and engine",
      "Deterministic offline LangChain model for baseline and regression"
    ],
    "steps": [
      "rtk bun scripts/verify-generated-ai.mjs",
      "Invalid agent input is rejected as BAD_REQUEST / HTTP 400; valid tool invocation persists output and remains idempotent."
    ],
    "before": {
      "status": "failed",
      "command": "rtk bun /Users/mustafaelsayed/Workspace/relkit-regression-demo/scripts/verify-generated-ai.mjs",
      "cwd": ".",
      "exit_code": 1,
      "output": "evidence/001/api-before.txt",
      "assertion": "Invalid agent input is rejected as BAD_REQUEST / HTTP 400; valid tool invocation persists output and remains idempotent."
    },
    "after": {
      "status": "passed",
      "command": "rtk bun /Users/mustafaelsayed/Workspace/relkit-regression-demo/scripts/verify-generated-ai.mjs",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/api-after.txt",
      "assertion": "Invalid agent input is rejected as BAD_REQUEST / HTTP 400; valid tool invocation persists output and remains idempotent."
    }
  },
  "e2e": {
    "status": "passed",
    "command": "rtk env RELKIT_GENERATED_HOST_URL=http://127.0.0.1:3330 bun x playwright test --config=playwright.commerce.config.ts",
    "cwd": ".",
    "exit_code": 0,
    "output": "evidence/001/browser.txt",
    "assertion": "Three browser cases pass: actual generated-host origin/validation, commerce agent streaming, two-tab fanout and late-tab restore."
  },
  "regressions": [
    {
      "kind": "api",
      "boundary": "Actual generated-host integration",
      "status": "passed",
      "command": "rtk bun /Users/mustafaelsayed/Workspace/relkit-regression-demo/scripts/verify-generated-ai.mjs",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/api-after.txt",
      "assertion": "Invalid agent input is rejected as BAD_REQUEST / HTTP 400; valid tool invocation persists output and remains idempotent."
    },
    {
      "kind": "integration",
      "boundary": "HTTP/auto clients, supervisor forwarding, agent acceptance, auth, WebSockets",
      "status": "passed",
      "command": "rtk bun test packages/client packages/supervisor",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/adjacent-bun.txt",
      "assertion": "131 client/supervisor tests pass."
    },
    {
      "kind": "integration",
      "boundary": "Hono agent, realtime, transport security and RPC error handling",
      "status": "passed",
      "command": "rtk bun x vitest run packages/runtime-hono/tests/agent-rpc.test.ts packages/runtime-hono/tests/realtime-rpc.test.ts packages/runtime-hono/tests/transport-security.test.ts packages/runtime-hono/tests/rpc-websocket.test.ts packages/runtime-hono/tests/rpc-error-status.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/adjacent-vitest.txt",
      "assertion": "20 runtime cases pass."
    }
  ],
  "checks": [
    {
      "name": "typecheck",
      "status": "passed",
      "command": "rtk bun x tsc -b packages/client packages/supervisor packages/runtime-hono --pretty false",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/typecheck.txt"
    },
    {
      "name": "test-types",
      "status": "passed",
      "command": "rtk bun x tsc -p packages/runtime-hono/tsconfig.tests.json --pretty false",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/test-typecheck.txt"
    },
    {
      "name": "boundaries",
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
      "name": "format",
      "status": "passed",
      "command": "rtk bun node_modules/prettier/bin/prettier.cjs --check <changed files>",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/format.txt"
    },
    {
      "name": "guardrails",
      "status": "passed",
      "command": "rtk bun test tests/phase0.test.ts",
      "cwd": ".",
      "exit_code": 0,
      "output": "evidence/001/guardrails.txt"
    }
  ],
  "limitations": [
    "No cloud deployment, commits, pushes, or full-repository acceptance were requested or run.",
    "Commerce browser harness substitutes engine dispatch/backing behavior; generated-host browser and API checks use the actual engine/providers.",
    "Existing HTTP execution logging/local telemetry is reused. No remote APM was configured for this fixture; HTTP responses and persisted state/presence provide the behavioral assertions.",
    "The read-only Effect checkout lacks the relevant core Stream source/test files; installed pinned effect 4.0.0-rc.115 source was inspected. No Effect implementation was modified."
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
  "Actual demo public-origin HTTP/WebSocket probe passes on 3000; actual demo generated agent function returns HTTP 200 with gpt-6-luna. Credentials retained only in running process memory."
]
```

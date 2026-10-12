# Testing a RELKIT application

Generated projects use Bun's test runner and `@relkit/testing`. Start with the existing `tests/unit` and `tests/integration` examples, then test the boundary that owns the behavior. Keep external providers and test state explicit; `RELKIT_ENV=test` alone does not select fakes.

## Direct function tests

`invokeFunction` runs a function descriptor through RELKIT's input/output validation and handler path without an HTTP server. Import a service's public function through its `service.ts` when testing the public member:

```ts
import { expect, test } from "bun:test";
import { invokeFunction } from "@relkit/testing";
import orders from "@app/orders/service.js";

test("createOrder calculates its total", async () => {
  await expect(
    invokeFunction(orders.createOrder, { orderId: "order-1", sku: "book", quantity: 3 }),
  ).resolves.toEqual({ orderId: "order-1", sku: "book", totalCents: 300 });
});
```

Pass explicit `env`, `context`, `clients`, or other `InvokeFunctionOptions` when the function needs them. Test invalid input and declared errors as well as success. Direct invocation does not test route mapping or middleware.

For several invocations that share a deterministic clock or provider state, use `createTestRuntime({ app, env, providers, startTimeMs })` and `runtime.invoke(target, input)`. `runtime.clock.advance(ms)` controls its test clock. Always `await runtime.close()` in `finally` or `afterAll`.

## Application and HTTP tests

`createTestApplication` discovers the generated project's routes and services. Pass its existing `relkit.config.ts`; `resourceProviders: "fake"` explicitly replaces graph-required resource providers for local tests:

```ts
import { afterAll, expect, test } from "bun:test";
import { createTestApplication } from "@relkit/testing";
import config from "../../relkit.config.js";

const app = await createTestApplication(config, { resourceProviders: "fake" });
afterAll(() => app.close());

test("POST /orders maps and validates input", async () => {
  const response = await app.http.request("/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderId: "order-1", sku: "book", quantity: 3 }),
  });
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ orderId: "order-1", sku: "book", totalCents: 300 });
});
```

Use `app.http.request`, `get`, or other client methods to assert status, body, and headers. Add requests for invalid input, anonymous callers, and unauthorized resource access where relevant. The harness has `runtime`, `clock`, `fakes`, and `observability` for controlled state and inspection. Options include `env`, `environment`, `bindingValues`, `providers`, and `projectRoot`; use explicit values for test-only configuration. This in-process HTTP boundary does not prove the full production middleware, cookie/origin policy, OpenAPI, or network transport. Verify those against a running backend when relevant.

## Provider and feature tests

- `createTestCacheFake`, `createTestBucketFake`, `createTestJobFake`, and `createTestEventFake` provide owned, inspectable test dependencies. `createTestFakes` groups native clients. Close any separately created fake after use. Replace every configured provider profile the graph needs, not only the one under direct assertion.
- `createTestHttpClient` exercises a standalone in-memory HTTP application. Use `createTestApplication` when route discovery and service wiring matter. `createTestRealtimeProvider` and `createTestAgentStateProvider` supply local stateful provider replacements.
- `createTestModel`, `createTestAgent`, and `assertAgentTrace` support deterministic agent execution. Use scripted responses and inspect tool calls or traces instead of live model calls or sleeps.
- For jobs, assert behavior beyond the descriptor shape: input/output, accepted run handle, progress, retry or cancellation policy, and idempotency where applicable. Use the test job adapter or fake appropriate to the contract.
- For database and auth integration, migrate an isolated temporary database before starting the application. Supply both parsed RELKIT environment and any native auth process environment required by the provider; close the app before removing test-owned files. Test public and protected requests with real cookies and separate users. A direct function mock does not verify migrations, sessions, or route protection.
- For realtime, streaming, and observability, test the exposed route or channel contract and recorded events/spans as applicable. Use a running backend for actual transport, connection, and browser behavior.

## Run the generated project checks

```sh
bun test tests/unit/hello.function.test.ts
bun run test:unit
bun run test:integration
bun run test
bun run check
bun run typecheck
bun run build
```

Run only scripts present in the generated `package.json`; the task template may have a different test layout. Keep Docker, external providers, and cloud acceptance as explicit integration gates. The installed `@relkit/testing` declarations and the project's existing tests are the source for exact helper options.

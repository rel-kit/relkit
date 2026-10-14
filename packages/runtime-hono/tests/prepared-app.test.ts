/**
 * Compares actual prepared Fetch dispatch with the canonical eager application.
 * Native live test Scopes own each prepared generation and join its disposal;
 * independent GET requests retain identical URL and request-identity headers.
 */
import { expect, it, test } from "@effect/vitest";
import { Effect } from "effect";
import { createApp } from "../src/create-app.js";
import { requiresDeferredTransport } from "../src/prepared-app.js";
import type { HttpInvocationOptions } from "../src/materialize-routes.types.js";
import { preparedOptions } from "./prepared-fixture.js";
import { acquirePreparedApp, inferredTargetOptions } from "./prepared-app-fixture.js";

it.live("real prepared dispatch preserves REST, RPC, MCP and absent agent responses", () =>
  Effect.gen(function* () {
    const requests: Array<string | undefined> = [];
    const identities: string[] = [];
    const options = preparedOptions((id) => requests.push(id));
    const eager = createApp(options);
    const prepared = yield* acquirePreparedApp(options);
    yield* Effect.forEach(
      ["/hello", "/rpc/missing", "/mcp", "/_relkit/v1/agents/missing/workflow"],
      (path) =>
        Effect.gen(function* () {
          const request = new Request(`http://localhost${path}`, {
            headers: { "x-request-id": "request.fixed" },
          });
          const expected = yield* Effect.promise(async () =>
            eager.fetch(new Request(request.url, { headers: request.headers })),
          );
          const actual = yield* Effect.promise(async () => prepared.fetch(request));
          if (path === "/hello") {
            identities.push(expected.headers.get("x-request-id") ?? "absent");
            identities.push(actual.headers.get("x-request-id") ?? "absent");
          }
          expect(actual.status).toBe(expected.status);
          expect(yield* Effect.promise(() => actual.text())).toBe(
            yield* Effect.promise(() => expected.text()),
          );
        }),
      { concurrency: 1, discard: true },
    );
    expect(requests).toEqual(identities);
    expect(new Set(requests).size).toBe(2);
  }),
);

test("optional path selection matches transport boundaries without claiming sibling paths", () => {
  expect(
    ["/rpc", "/rpc/", "/mcp", "/_relkit/v1/agents/a/ag-ui"].map(requiresDeferredTransport),
  ).toEqual([true, true, true, true]);
  expect(
    ["/hello", "/rpc-other", "/mcp-other", "/_relkit/v1/graph"].map(requiresDeferredTransport),
  ).toEqual([false, false, false, false]);
});

it.live("prepared REST resolves the real target before inference and invocation", () =>
  Effect.gen(function* () {
    const invocations: Pick<HttpInvocationOptions, "input" | "target">[] = [];
    const { options, target } = inferredTargetOptions(invocations);
    const app = yield* acquirePreparedApp(options);
    const response = yield* Effect.promise(async () =>
      app.fetch(new Request("http://localhost/hello?page=2&active=true")),
    );
    expect(yield* Effect.promise(() => response.json())).toEqual({ ok: true });
    expect(invocations).toEqual([{ input: { page: 2, active: true }, target }]);
  }),
);

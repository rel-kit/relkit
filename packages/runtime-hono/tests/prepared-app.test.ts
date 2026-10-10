/**
 * Compares real prepared Fetch dispatch with the canonical eager application.
 * Coverage proves REST request identity, framework responses and optional path
 * behavior while each prepared generation is disposed in the test's lifetime.
 */
import { expect, test } from "vitest";
import { z } from "@relkit/schema";
import { createApp } from "../src/create-app.js";
import { createPreparedApp, requiresDeferredTransport } from "../src/prepared-app.js";
import { preparedOptions } from "./prepared-fixture.js";

test("real prepared dispatch preserves REST, RPC, MCP and absent agent responses", async () => {
  const requests: Array<string | undefined> = [];
  const identities: string[] = [];
  const options = preparedOptions((id) => requests.push(id));
  const eager = createApp(options);
  const prepared = await createPreparedApp(options);
  try {
    for (const path of ["/hello", "/rpc/missing", "/mcp", "/_relkit/v1/agents/missing/workflow"]) {
      const request = new Request(`http://localhost${path}`, {
        headers: { "x-request-id": "request.fixed" },
      });
      const expected = await eager.fetch(request.clone());
      const actual = await prepared.fetch(request);
      if (path === "/hello") {
        identities.push(expected.headers.get("x-request-id") ?? "absent");
        identities.push(actual.headers.get("x-request-id") ?? "absent");
      }
      expect(actual.status).toBe(expected.status);
      expect(await actual.text()).toBe(await expected.text());
    }
    expect(requests).toEqual(identities);
    expect(new Set(requests).size).toBe(2);
  } finally {
    await prepared.close();
  }
});

test("optional path selection matches transport boundaries without claiming sibling paths", () => {
  expect(
    ["/rpc", "/rpc/", "/mcp", "/_relkit/v1/agents/a/ag-ui"].map(requiresDeferredTransport),
  ).toEqual([true, true, true, true]);
  expect(
    ["/hello", "/rpc-other", "/mcp-other", "/_relkit/v1/graph"].map(requiresDeferredTransport),
  ).toEqual([false, false, false, false]);
});

test("prepared REST resolves the real target before inference and invocation", async () => {
  const invocations: Array<{ readonly input: unknown; readonly target: unknown }> = [];
  const base = preparedOptions();
  const { mapInput: _mapInput, ...baseWithoutMapInput } = base;
  const target = {
    input: z.object({ page: z.number(), active: z.boolean() }),
    output: z.unknown(),
    handler: () => ({ ok: true }),
  };
  const app = await createPreparedApp({
    ...baseWithoutMapInput,
    plan: {
      ...base.plan,
      httpTriggers: base.plan.httpTriggers.map((trigger) => ({
        ...trigger,
        config: {
          ...trigger.config,
          request: {
            kind: "input" as const,
            fields: {
              page: { kind: "query" as const, name: "page" },
              active: { kind: "query" as const, name: "active" },
            },
          },
        },
      })),
    },
    resolveTarget: async () => target,
    engine: {
      invoke: async ({ input, target: resolved }) => {
        invocations.push({ input, target: resolved });
        return { ok: true };
      },
    },
  });
  try {
    expect(
      await (await app.fetch(new Request("http://localhost/hello?page=2&active=true"))).json(),
    ).toEqual({ ok: true });
    expect(invocations).toEqual([{ input: { page: 2, active: true }, target }]);
  } finally {
    await app.close();
  }
});

import { z } from "@zsys/schema";
import { createApp } from "./src/index.js";
import { mapRequest, type MappingRequest } from "./src/request-mapping.js";
import type { RegistrationPlan } from "@zsys/graph";

const source = { file: "src/app.ts", line: 1, column: 1 } as const;

function request(
  value: Request,
  query: MappingRequest["query"] = {},
  headers: MappingRequest["headers"] = {},
): MappingRequest {
  return { request: value, params: { id: "order-1" }, query, headers };
}

test("maps every request source with nesting, defaults, and a named transform", async () => {
  const result = await mapRequest(
    request(
      new Request("http://localhost/orders/order-1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sku: "sku-1", quantity: 2 }),
      }),
      { term: "all" },
      { authorization: "secret", cookie: "session=abc" },
    ),
    {
      kind: "input",
      fields: {
        id: { kind: "path", name: "id" },
        query: {
          kind: "nested",
          fields: {
            term: { kind: "query", name: "term" },
            limit: { kind: "default", value: { kind: "query", name: "limit" }, default: 20 },
          },
        },
        auth: { kind: "header", name: "authorization" },
        session: { kind: "cookie", name: "session" },
        body: { kind: "body", name: "sku" },
        quantity: { kind: "body", name: "quantity" },
        normalized: {
          kind: "transform",
          transformId: "trim",
          value: { kind: "query", name: "term" },
        },
      },
    },
    { transforms: { trim: z.string().transform((value) => value.trim()) } },
  );

  expect(result).toEqual({
    ok: true,
    value: {
      id: "order-1",
      query: { term: "all", limit: 20 },
      auth: "secret",
      session: "abc",
      body: "sku-1",
      quantity: 2,
      normalized: "all",
    },
  });
});

test("rejects missing and duplicate scalar sources with structured issues", async () => {
  const result = await mapRequest(
    request(
      new Request("http://localhost/orders"),
      { tag: ["a", "b"] },
      { "x-token": ["a", "b"], cookie: "id=1; id=2" },
    ),
    {
      kind: "input",
      fields: {
        required: { kind: "query", name: "required" },
        tag: { kind: "query", name: "tag" },
        token: { kind: "header", name: "x-token" },
        id: { kind: "cookie", name: "id" },
      },
    },
  );

  expect(result.ok).toBe(false);
  if (!result.ok)
    expect(result.issues.map(({ code, path }) => [code, path])).toEqual([
      ["missing", ["required"]],
      ["duplicate", ["tag"]],
      ["duplicate", ["token"]],
      ["duplicate", ["id"]],
    ]);
});

test("rejects wrong content type, malformed JSON, and oversized bodies", async () => {
  const mapping = { kind: "input", fields: { body: { kind: "whole-body" } } };
  const wrongType = await mapRequest(
    request(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "{}",
      }),
    ),
    mapping,
  );
  const malformed = await mapRequest(
    request(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
    ),
    mapping,
  );
  const tooLarge = await mapRequest(
    request(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "12345",
      }),
    ),
    mapping,
    { maxBodyBytes: 3 },
  );

  expect(wrongType).toMatchObject({ ok: false, issues: [{ code: "content-type" }] });
  expect(malformed).toMatchObject({ ok: false, issues: [{ code: "malformed-json" }] });
  expect(tooLarge).toMatchObject({ ok: false, issues: [{ code: "body-too-large" }] });
});

test("maps multipart fields and stops before engine invocation on failure", async () => {
  const form = new FormData();
  form.append("file", "contents");
  const multipart = await mapRequest(
    request(new Request("http://localhost", { method: "POST", body: form })),
    { kind: "input", fields: { file: { kind: "multipart", name: "file" } } },
  );
  expect(multipart).toMatchObject({ ok: true, value: { file: "contents" } });

  let calls = 0;
  const plan = routePlan();
  const app = createApp({
    plan,
    manifest: {
      contractVersion: 1,
      generatorVersion: 1,
      graphHash: plan.graphHash,
      functions: {},
      middleware: {},
      requestTransforms: {},
    },
    engine: {
      invoke: async () => {
        calls += 1;
        return { ok: true };
      },
    },
  });
  const response = await app.request("http://localhost/orders");
  expect(response.status).toBe(422);
  expect(calls).toBe(0);
  expect(await response.json()).toMatchObject({
    error: "validation",
    issues: [{ code: "missing" }],
  });
});

function routePlan(): RegistrationPlan {
  return {
    graphHash: "sha256:mapping",
    functions: [],
    httpTriggers: [
      {
        kind: "trigger",
        id: "orders.route",
        source,
        triggerType: "http",
        targetFunctionId: "orders.create",
        config: {
          method: "GET",
          path: "/orders",
          request: { kind: "input", fields: { id: { kind: "query", name: "id" } } },
          responses: [{ kind: "validation-error", id: "validation.422", status: 422 }],
          middleware: [],
          transforms: [],
        },
      },
    ],
    queues: [],
    schedules: [],
    eventTriggers: [],
    buckets: [],
    caches: [],
    tools: [],
    agents: [],
  };
}

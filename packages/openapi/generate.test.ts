import { expect, test } from "bun:test";
import { GRAPH_VERSION } from "@relkit/contracts";
import type { ApplicationGraph } from "@relkit/graph";
import { generateOpenApi, generateOpenApiJson } from "./src/index.ts";

const stringSchema = { type: "string" } as const;
const input = {
  type: "object",
  required: ["id", "sku", "authorization"],
  properties: {
    id: stringSchema,
    sku: stringSchema,
    authorization: stringSchema,
    tag: stringSchema,
  },
};
const output = {
  type: "object",
  required: ["totalCents"],
  properties: { totalCents: { type: "number" } },
};
const errorData = { type: "object", required: ["id"], properties: { id: stringSchema } };

test("generates stable OpenAPI from route, function, error, mapping, and middleware metadata", () => {
  const first = graph(false);
  const second = graph(true);
  const document = generateOpenApi(first);
  const operation = document.paths["/orders/{id}"]?.get;

  expect(document.openapi).toBe("3.1.0");
  expect(document.tags).toEqual([
    { name: "orders", description: "Order operations" },
    { name: "read" },
  ]);
  expect(document["x-relkit"].graphVersion).toBe(GRAPH_VERSION);
  expect(operation?.operationId).toBe("orders.get");
  expect(operation?.summary).toBe("Get order");
  expect(operation?.description).toBe("Returns one order.");
  expect(operation?.tags).toEqual(["orders", "read"]);
  expect(operation?.parameters).toContainEqual({
    name: "authorization",
    in: "header",
    required: true,
    schema: stringSchema,
  });
  expect(operation?.parameters).toContainEqual({
    name: "tag",
    in: "query",
    required: false,
    schema: stringSchema,
  });
  expect(operation?.requestBody?.content["application/json"]?.schema).toEqual({
    type: "object",
    properties: { sku: stringSchema },
    required: ["sku"],
  });
  expect(operation?.responses["201"]?.content?.["application/json"]?.schema).toEqual(output);
  expect(operation?.responses["404"]?.content?.["application/json"]?.schema).toMatchObject({
    properties: { data: errorData, code: { const: "orders.not-found" } },
    required: ["kind", "outcome", "code", "message", "data", "status", "retry"],
  });
  expect(operation?.responses["422"]?.content?.["application/json"]?.schema).toMatchObject({
    properties: { error: { const: "validation" }, issues: { type: "array" } },
  });
  expect(operation?.["x-relkit"].middleware).toEqual([
    { id: "orders.auth", targetFunctionId: "orders.authorize" },
  ]);
  expect(generateOpenApiJson(first)).toBe(generateOpenApiJson(second));
});

test("expands optional catch-all routes without duplicating the authored route", () => {
  const inputGraph = graph(false);
  const target = inputGraph.nodes.find((node) => node.kind === "function")! as any;
  const trigger = inputGraph.nodes.find((node) => node.kind === "trigger")! as any;
  target.input = {
    type: "object",
    properties: { parts: { type: "array", items: { type: "string" } } },
  };
  trigger.id = "docs.read";
  trigger.config.path = "/docs/*parts?";
  trigger.config.runtimePaths = ["/docs", "/docs/:parts{.+}"];
  trigger.config.request = {
    kind: "input",
    fields: { parts: { kind: "optional", value: { kind: "path-segments", name: "parts" } } },
  };
  const document = generateOpenApi(inputGraph);

  expect(document.paths["/docs"]?.get?.operationId).toBe("docs.read");
  expect(document.paths["/docs"]?.get?.parameters).toBeUndefined();
  expect(document.paths["/docs/{parts}"]?.get?.operationId).toBe("docs.read.catch-all");
  expect(document.paths["/docs/{parts}"]?.get?.parameters).toContainEqual({
    name: "parts",
    in: "path",
    required: true,
    schema: { type: "string" },
  });
});

test("projects single and repeated file fields as multipart binary schemas", () => {
  const inputGraph = graph(false);
  const target = inputGraph.nodes.find((node) => node.kind === "function")! as any;
  const trigger = inputGraph.nodes.find((node) => node.kind === "trigger")! as any;
  const binary = { type: "string", format: "binary" };
  target.input = {
    type: "object",
    required: ["avatar", "attachments"],
    properties: {
      avatar: binary,
      attachments: { type: "array", items: binary },
    },
  };
  trigger.config.path = "/uploads";
  trigger.config.request = {
    kind: "input",
    fields: {
      avatar: { kind: "multipart", name: "avatar" },
      attachments: { kind: "multipart-all", name: "attachments" },
    },
  };
  const body = generateOpenApi(inputGraph).paths["/uploads"]?.get?.requestBody;

  expect(body?.content["multipart/form-data"]?.schema).toEqual({
    type: "object",
    properties: {
      attachments: { type: "array", items: binary },
      avatar: binary,
    },
    required: ["attachments", "avatar"],
  });
});

test("documents rate-limit policy, safe body, and standard headers", () => {
  const inputGraph = graph(false);
  const trigger = inputGraph.nodes.find((node) => node.kind === "trigger")! as any;
  trigger.config.rateLimit = {
    limit: 10,
    windowMs: 1_000,
    key: { kind: "header", name: "x-api-key" },
    storeId: "api-rate-limits",
  };
  trigger.config.responses.push({
    kind: "response",
    id: "rate-limit.429",
    status: 429,
  });
  const operation = generateOpenApi(inputGraph).paths["/orders/{id}"]?.get;

  expect(operation?.["x-relkit"].rateLimit).toEqual(trigger.config.rateLimit);
  expect(operation?.responses["429"]).toMatchObject({
    description: "Rate limit exceeded",
    headers: {
      "RateLimit-Policy": {},
      "RateLimit-Limit": {},
      "RateLimit-Remaining": {},
      "RateLimit-Reset": {},
      "Retry-After": {},
    },
    content: {
      "application/json": {
        schema: { properties: { error: { const: "rate-limit" }, retryAfterMs: {} } },
      },
    },
  });
});

function graph(reverse: boolean): ApplicationGraph {
  const nodes = [
    {
      kind: "service",
      id: "orders",
      source: { file: "src/orders/service.ts", line: 1, column: 1 },
      title: "Orders",
      description: "Order operations",
      tags: ["orders"],
      members: [{ name: "get", functionId: "orders.get" }],
      middleware: [],
    },
    {
      kind: "function",
      id: "orders.get",
      source: { file: "src/functions/get.ts", line: 1, column: 1 },
      input,
      output,
      errors: [
        {
          kind: "error",
          id: "orders.not-found",
          ref: { kind: "error", id: "orders.not-found" },
          data: { $relkit: "schema", jsonSchema: errorData },
          retry: "never",
          http: { status: 404 },
        },
      ],
    },
    {
      kind: "trigger",
      id: "orders.get",
      triggerType: "http",
      targetFunctionId: "orders.get",
      source: { file: "src/routes/get.ts", line: 1, column: 1 },
      config: {
        method: "GET",
        path: "/orders/:id",
        title: "Get order",
        description: "Returns one order.",
        tags: ["read"],
        request: {
          kind: "input",
          fields: {
            id: { kind: "path", name: "id" },
            sku: { kind: "body", name: "sku" },
            authorization: { kind: "header", name: "authorization" },
            tag: { kind: "optional", value: { kind: "query", name: "tag" } },
          },
        },
        responses: [
          { kind: "success", id: "success.201", status: 201, schema: null },
          {
            kind: "error",
            id: "error.orders.not-found.404",
            errorId: "orders.not-found",
            status: 404,
            schema: null,
          },
          { kind: "validation-error", id: "validation.422", status: 422, schema: null },
        ],
        middleware: [{ id: "orders.auth", targetFunctionId: "orders.authorize" }],
        transforms: [{ id: "orders.normalize-id", schema: stringSchema }],
      },
    },
  ];
  return {
    contractVersion: GRAPH_VERSION,
    appId: "commerce",
    nodes: reverse ? nodes.reverse() : nodes,
    edges: [],
  } as unknown as ApplicationGraph;
}

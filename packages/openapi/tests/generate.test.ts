import { expect, test } from "vitest";
import { GRAPH_VERSION } from "@relkit/contracts";
import { generateOpenApi, generateOpenApiJson } from "../src/index.js";
import { errorData, graph, output, stringSchema } from "./generate-fixture.js";

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
  const target = inputGraph.nodes.find((node) => node.kind === "function");
  const trigger = inputGraph.nodes.find((node) => node.kind === "trigger");
  if (target?.kind !== "function" || trigger?.kind !== "trigger")
    throw new Error("invalid fixture");
  Object.assign(target, {
    input: {
      type: "object",
      properties: { parts: { type: "array", items: { type: "string" } } },
    },
  });
  Object.assign(trigger, { id: "docs.read" });
  Object.assign(trigger.config, {
    path: "/docs/*parts?",
    runtimePaths: ["/docs", "/docs/:parts{.+}"],
    request: {
      kind: "input",
      fields: { parts: { kind: "optional", value: { kind: "path-segments", name: "parts" } } },
    },
  });
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

test("omits domain tags without documented HTTP operations", () => {
  const inputGraph = graph(false);
  const source = { file: "src/receipts/service.ts", line: 1, column: 1 };
  const document = generateOpenApi({
    ...inputGraph,
    nodes: [
      ...inputGraph.nodes,
      ...["receipts", "database", "telemetry", "auth"].map((id) => ({
        kind: "service" as const,
        id,
        source,
        functions: [],
        events: [],
      })),
    ],
  });

  expect(document.tags?.map((tag) => tag.name)).toEqual(["orders", "read"]);
  expect(document.paths).toHaveProperty("/orders/{id}");
});

test("projects single and repeated file fields as multipart binary schemas", () => {
  const inputGraph = graph(false);
  const target = inputGraph.nodes.find((node) => node.kind === "function");
  const trigger = inputGraph.nodes.find((node) => node.kind === "trigger");
  if (target?.kind !== "function" || trigger?.kind !== "trigger")
    throw new Error("invalid fixture");
  const binary = { type: "string", format: "binary" };
  Object.assign(target, {
    input: {
      type: "object",
      required: ["avatar", "attachments"],
      properties: {
        avatar: binary,
        attachments: { type: "array", items: binary },
      },
    },
  });
  Object.assign(trigger.config, {
    path: "/uploads",
    request: {
      kind: "input",
      fields: {
        avatar: { kind: "multipart", name: "avatar" },
        attachments: { kind: "multipart-all", name: "attachments" },
      },
    },
  });
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
  const trigger = inputGraph.nodes.find((node) => node.kind === "trigger");
  if (trigger?.kind !== "trigger") throw new Error("invalid fixture");
  Object.assign(trigger.config, {
    rateLimit: {
      limit: 10,
      windowMs: 1_000,
      key: { kind: "header", name: "x-api-key" },
      storeId: "api-rate-limits",
    },
    responses: [
      ...trigger.config.responses,
      {
        kind: "response",
        id: "rate-limit.429",
        status: 429,
      },
    ],
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

import { expect, test } from "bun:test";
import type { ApplicationGraph } from "@zsys/graph";
import { generateOpenApi, generateOpenApiJson } from "./src/index.ts";

const stringSchema = { type: "string" } as const;
const input = {
  type: "object",
  required: ["id", "sku", "authorization"],
  properties: { id: stringSchema, sku: stringSchema, authorization: stringSchema },
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
  expect(document["x-zsys"].graphVersion).toBe(1);
  expect(operation?.operationId).toBe("orders.get");
  expect(operation?.parameters).toContainEqual({
    name: "authorization",
    in: "header",
    required: true,
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
  expect(operation?.["x-zsys"].middleware).toEqual([
    { id: "orders.auth", targetFunctionId: "orders.authorize" },
  ]);
  expect(generateOpenApiJson(first)).toBe(generateOpenApiJson(second));
});

function graph(reverse: boolean): ApplicationGraph {
  const nodes = [
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
          data: { $zsys: "schema", jsonSchema: errorData },
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
        request: {
          kind: "input",
          fields: {
            id: { kind: "path", name: "id" },
            sku: { kind: "body", name: "sku" },
            authorization: { kind: "header", name: "authorization" },
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
    contractVersion: 1,
    appId: "commerce",
    nodes: reverse ? nodes.reverse() : nodes,
    edges: [],
  } as unknown as ApplicationGraph;
}

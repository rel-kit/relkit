import { expect, test } from "bun:test";
import type { ApplicationGraph } from "@zsys/graph";
import { generateClient } from "./src/index.ts";

const stringSchema = { type: "string" };
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

test("generates stable typed methods from mapped HTTP routes", () => {
  const first = generateClient(graph(false));
  const second = generateClient(graph(true));

  expect(first).toBe(second);
  expect(first).toContain(
    'export type OrdersGetInput = { "authorization": string; "id": string; "sku": string; "tag"?: string };',
  );
  expect(first).toContain("export type OrdersGetSuccess = OrdersGetResponse0;");
  expect(first).toContain("export type OrdersGetError = OrdersGetResponse1 | OrdersGetResponse2;");
  expect(first).toContain('export type OrdersGetStatus = OrdersGetResult["status"];');
  expect(first).toContain("readonly baseUrl?: string;");
  expect(first).toContain("readonly fetch?: typeof globalThis.fetch;");
  expect(first).toContain('appendQuery(query, \"tag\"');
  expect(first).toContain('setHeader(headers, \"authorization\"');
  expect(first).toContain('setBodyValue(payload, [\"sku\"]');
  expect(first).not.toContain("hono");
  expect(first).not.toContain("@zsys/runtime");
});

function graph(reverse: boolean): ApplicationGraph {
  const nodes = [
    {
      kind: "function",
      id: "orders.get",
      source: { file: "src/functions/get.ts", line: 1, column: 1 },
      input,
      output: {
        type: "object",
        required: ["totalCents"],
        properties: { totalCents: { type: "number" } },
      },
      errors: [
        {
          kind: "error",
          id: "orders.not-found",
          data: { type: "object", properties: { id: stringSchema } },
          http: { status: 404 },
          retry: "never",
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
            tag: { kind: "optional", value: { kind: "query", name: "tag" } },
          },
        },
        responses: [
          { kind: "success", id: "success.200", status: 200, schema: null },
          {
            kind: "error",
            id: "error.orders.not-found.404",
            errorId: "orders.not-found",
            status: 404,
            schema: null,
          },
          { kind: "validation-error", id: "validation.422", status: 422, schema: null },
        ],
        middleware: [],
        transforms: [],
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

import { GRAPH_VERSION } from "@relkit/contracts";
import type { ApplicationGraph } from "@relkit/graph";

export const stringSchema = { type: "string" } as const;
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
export const output = {
  type: "object",
  required: ["totalCents"],
  properties: { totalCents: { type: "number" } },
};
export const errorData = { type: "object", required: ["id"], properties: { id: stringSchema } };

/** Build an isolated graph for generator behavior tests.
 * @param reverse - Reverse node order to check deterministic output.
 * @returns A fresh graph with one service, function, and HTTP route.
 * @example const source = graph(false);
 */
export function graph(reverse: boolean): ApplicationGraph {
  const nodes = [
    {
      kind: "service",
      id: "orders",
      source: { file: "src/orders/service.ts", line: 1, column: 1 },
      title: "Orders",
      description: "Order operations",
      tags: ["orders"],
      functions: [{ name: "get", functionId: "orders.get" }],
      events: [],
    },
    {
      kind: "function",
      invocationMode: "callable",
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

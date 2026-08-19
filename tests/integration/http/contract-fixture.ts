import type { ApplicationGraph } from "../../../packages/graph/src/index.ts";

const input = {
  type: "object",
  required: ["orderId", "note"],
  properties: {
    orderId: { type: "string" },
    note: { type: "string" },
  },
};

const output = {
  type: "object",
  required: ["orderId", "totalCents"],
  properties: {
    orderId: { type: "string" },
    totalCents: { type: "number" },
  },
};

const errorData = {
  type: "object",
  required: ["orderId"],
  properties: { orderId: { type: "string" } },
};

/** One small graph shared by the HTTP runtime and generated-contract fixtures. */
export function contractGraph(root = "/project", reverse = false): ApplicationGraph {
  const nodes = [
    {
      kind: "function",
      id: "orders.get",
      source: { file: `${root}/src/functions/get.ts`, line: 1, column: 1 },
      input,
      output,
      errors: [
        {
          kind: "error",
          id: "orders.not-found",
          ref: { kind: "error", id: "orders.not-found" },
          data: errorData,
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
      source: { file: `${root}/src/routes/get.ts`, line: 1, column: 1 },
      config: {
        method: "GET",
        path: "/orders/:orderId",
        request: {
          kind: "input",
          fields: {
            orderId: { kind: "path", name: "orderId" },
            note: { kind: "query", name: "note" },
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

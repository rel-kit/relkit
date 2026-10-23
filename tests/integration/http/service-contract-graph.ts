/** Static HTTP contract shared by the runtime/document/client assertions. */
import { GRAPH_VERSION } from "../../../packages/contracts/src/index.ts";
import type { ApplicationGraph } from "../../../packages/graph/src/index.ts";
const source = { file: "src/routes/orders.ts", line: 1, column: 1 } as const;
export const serviceGraph: ApplicationGraph = {
  contractVersion: GRAPH_VERSION,
  nodes: [
    {
      kind: "service",
      id: "orders",
      domainId: "orders",
      source,
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
      domainId: "orders",
      exposure: "public",
      source,
      input: {
        type: "object",
        required: ["orderId", "productId", "note", "tag"],
        properties: {
          orderId: { type: "string" },
          productId: { type: "string" },
          note: { type: "string" },
          tag: { type: "string" },
        },
      },
      output: {
        type: "object",
        required: ["orderId", "productId", "tags", "tenant"],
        properties: {
          orderId: { type: "string" },
          productId: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          tenant: { type: "string" },
        },
      },
    },
    {
      kind: "trigger",
      id: "orders.get.route",
      source,
      triggerType: "http",
      targetFunctionId: "orders.get",
      config: {
        method: "GET",
        path: "/orders/:orderId/products/:productId",
        request: {
          kind: "input",
          fields: {
            orderId: { kind: "path", name: "orderId" },
            productId: { kind: "path", name: "productId" },
            note: { kind: "query", name: "note" },
            tag: { kind: "query", name: "tag" },
          },
        },
        responses: [{ kind: "success", id: "success.200", status: 200 }],
        middleware: [],
        transforms: [],
      },
    },
  ],
  edges: [],
};

import { expect, test } from "bun:test";
import { assertProductionGraph, type ApplicationGraph } from "../../packages/graph/src/index.ts";

test("rejects a production graph with a generation-local rate-limit store", () => {
  const graph = {
    contractVersion: 2,
    nodes: [
      {
        kind: "trigger",
        id: "orders.list",
        source: { file: "src/routes/orders/route.ts", line: 1, column: 1 },
        triggerType: "http",
        targetFunctionId: "orders.list",
        config: {
          method: "GET",
          path: "/orders",
          request: {},
          responses: [],
          middleware: [],
          transforms: [],
          rateLimit: { limit: 10, windowMs: 1_000, key: { kind: "constant", value: "all" } },
        },
      },
    ],
    edges: [],
  } as unknown as ApplicationGraph;

  expect(() => assertProductionGraph(graph)).toThrow("shared rate-limit cache store");
  (graph.nodes[0]!.config as any).rateLimit.storeId = "api-rate-limits";
  expect(() => assertProductionGraph(graph)).not.toThrow();
});

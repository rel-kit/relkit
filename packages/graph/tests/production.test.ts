import { expect, test } from "vitest";
import { GRAPH_VERSION, type JsonValue } from "@relkit/contracts";
import { assertProductionGraph, type ApplicationGraph } from "../src/index.js";
import { functionNode, graph as makeGraph } from "./graph-fixtures.js";
test("accepts graphs without HTTP triggers", () => {
  expect(() => assertProductionGraph(makeGraph([functionNode()]))).not.toThrow();
});
test("rejects a production graph with a generation-local rate-limit store", () => {
  const graph: ApplicationGraph = {
    contractVersion: GRAPH_VERSION,
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
  };
  expect(() => assertProductionGraph(graph)).toThrow("shared rate-limit cache store");
  const route = graph.nodes[0];
  if (route?.kind !== "trigger") throw new Error("Expected HTTP trigger fixture.");
  const config = route.config as Record<string, JsonValue>;
  const withStore: ApplicationGraph = {
    ...graph,
    nodes: [
      {
        ...route,
        config: {
          ...config,
          rateLimit: {
            ...(config.rateLimit as Record<string, JsonValue>),
            storeId: "api-rate-limits",
          },
        },
      },
    ],
  };
  expect(() => assertProductionGraph(withStore)).not.toThrow();
});

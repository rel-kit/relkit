/** Checks that the graph takes its call edges from `dependencies` declarations. */
import { expect, it } from "vitest";
import { defineEvent } from "relkit/events";
import { defineFunction } from "relkit/functions";
import { defineChannel } from "relkit/realtime";
import { z } from "relkit/schema";
import { normalizeCompilation } from "../../src/compiler/normalize.js";

const empty = z.object({});
const priceOrder = defineFunction({
  id: "orders.price-order",
  input: empty,
  output: empty,
  handler: async () => ({}),
});
const orderCreated = defineEvent({ id: "orders.created", version: 1, input: empty });
const orderUpdates = defineChannel({
  id: "orders.updates",
  params: empty,
  events: { changed: empty },
  client: { public: true },
});
const database = {
  kind: "service",
  id: "database",
  ref: { kind: "service", id: "database" },
  capability: { kind: "drizzle", dialect: "sqlite", tables: [] },
};
const plainService = { kind: "service", id: "plain", ref: { kind: "service", id: "plain" } };

/** Compiles the descriptors and returns the graph with any diagnostics. */
function compile(descriptors: readonly unknown[]) {
  const result = normalizeCompilation({ descriptors, appId: "app" });
  const graph = JSON.parse(result.outputs.graph) as {
    readonly nodes: readonly Record<string, unknown>[];
    readonly edges: readonly Record<string, unknown>[];
  };
  return { graph, diagnostics: result.diagnostics.map((entry) => entry.message) };
}

it("builds call, publication, channel and database edges from dependencies", () => {
  const createOrder = defineFunction({
    id: "orders.create-order",
    input: empty,
    output: empty,
    dependencies: {
      functions: { priceOrder },
      events: { orderCreated },
      channels: { orderUpdates },
      databases: { database: database as never },
    },
    handler: async () => ({}),
  });
  const { graph, diagnostics } = compile([
    priceOrder,
    orderCreated,
    orderUpdates,
    database,
    createOrder,
  ]);

  expect(diagnostics).toEqual([]);
  expect(graph.edges.filter((edge) => edge.from === "orders.create-order")).toEqual([
    { from: "orders.create-order", kind: "calls-function", to: "orders.price-order" },
    { from: "orders.create-order", kind: "publishes-event", to: "orders.created" },
    { from: "orders.create-order", kind: "triggers-channel", to: "orders.updates" },
    { from: "orders.create-order", kind: "uses-database", to: "database" },
  ]);
  expect(graph.nodes.find((node) => node.id === "orders.create-order")?.dependencies).toEqual({
    functions: { priceOrder: { ref: { kind: "function", id: "orders.price-order" } } },
    events: { orderCreated: { ref: { kind: "event", id: "orders.created" } } },
    channels: { orderUpdates: { ref: { kind: "channel", id: "orders.updates" } } },
    databases: { database: { ref: { kind: "service", id: "database" } } },
  });
});

it("reports a database dependency that is not a database service", () => {
  const readPlain = defineFunction({
    id: "orders.read-plain",
    input: empty,
    output: empty,
    dependencies: { databases: { plain: plainService as never } },
    handler: async () => ({}),
  });
  const { diagnostics } = compile([plainService, readPlain]);
  expect(diagnostics).toContain('Dependency databases entry "plain" is not a database service.');
});

it("reports a dependency on a descriptor the application does not declare", () => {
  const callMissing = defineFunction({
    id: "orders.call-missing",
    input: empty,
    output: empty,
    dependencies: { functions: { priceOrder } },
    handler: async () => ({}),
  });
  const { diagnostics } = compile([callMissing]);
  expect(diagnostics).toContain("Dependency functions does not resolve to a known descriptor.");
});

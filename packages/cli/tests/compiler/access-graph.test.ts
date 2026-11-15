/** Checks that function access rules are recorded in the graph. */
import { expect, it } from "vitest";
import { defineFunction } from "relkit/functions";
import { z } from "relkit/schema";
import { normalizeCompilation } from "../../src/compiler/normalize.js";
import { defineService } from "relkit";

const empty = z.object({});

it("records roles, permissions and a predicate marker on the function node", () => {
  const refundOrder = defineFunction({
    id: "orders.refund-order",
    input: z.object({ orderId: z.string() }),
    output: empty,
    access: {
      roles: ["admin", "support"],
      permissions: ["orders:refund"],
      allow: ({ input }) => input.orderId !== "locked",
    },
    handler: async () => ({}),
  });
  const listOrders = defineFunction({
    id: "orders.list-orders",
    input: empty,
    output: empty,
    handler: async () => ({}),
  });
  const result = normalizeCompilation({ descriptors: [refundOrder, listOrders], appId: "app" });
  const graph = JSON.parse(result.outputs.graph) as {
    readonly nodes: readonly Record<string, unknown>[];
  };

  expect(result.diagnostics).toEqual([]);
  const node = (id: string) => graph.nodes.find((entry) => entry.id === id);
  expect(node("orders.refund-order")?.access).toMatchInlineSnapshot(`
    {
      "permissions": [
        "orders:refund",
      ],
      "predicate": true,
      "roles": [
        "admin",
        "support",
      ],
    }
  `);
  expect(node("orders.list-orders")).not.toHaveProperty("access");
});

it("makes each service with a protected function depend on the authentication service", () => {
  const protect = (id: string) =>
    defineFunction({
      id,
      input: empty,
      output: empty,
      access: { roles: ["dispatcher"] },
      handler: async () => ({}),
    });
  const create = protect("shipments.create");
  const cancel = protect("shipments.cancel");
  const list = defineFunction({
    id: "fleet.list",
    input: empty,
    output: empty,
    handler: async () => ({}),
  });
  const shipments = defineService({ id: "shipments", functions: { create, cancel } });
  const fleet = defineService({ id: "fleet", functions: { list } });
  // A service carrying the Better Auth capability, as `defineBetterAuthService` declares it.
  const authEntry = { ...defineService({ id: "auth" }), capability: { kind: "better-auth" } };
  const result = normalizeCompilation({
    descriptors: [authEntry, shipments, fleet, create, cancel, list],
    appId: "app",
  });
  const graph = JSON.parse(result.outputs.graph) as {
    readonly edges: readonly Record<string, unknown>[];
  };
  expect(result.diagnostics.filter((entry) => entry.severity === "error")).toEqual([]);
  // One edge for the service with two protected functions; none for the open one.
  expect(graph.edges.filter((edge) => edge.kind === "depends-on-service")).toEqual([
    { kind: "depends-on-service", from: "shipments", to: "auth" },
  ]);
});

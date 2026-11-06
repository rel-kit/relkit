/** Checks that function access rules are recorded in the graph. */
import { expect, it } from "vitest";
import { defineFunction } from "relkit/functions";
import { z } from "relkit/schema";
import { normalizeCompilation } from "../../src/compiler/normalize.js";

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

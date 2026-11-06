/** Route authentication and function access rules in the explorer's access section. */
import { expect, test } from "bun:test";
import type { GraphSnapshot } from "./graph-model";
import { buildHierarchy, routeAccess } from "./graph-hierarchy";
import { describeAccessRule } from "./graph-hierarchy-access";

const snapshot = {
  nodes: [
    {
      id: "orders.refund-order",
      kind: "function",
      label: "refundOrder",
      meta: { access: { roles: ["admin"], permissions: ["orders:refund"], predicate: true } },
    },
    {
      id: "route.post.refund",
      kind: "trigger",
      label: "POST /orders/:orderId/refund",
      meta: {
        triggerType: "http",
        targetFunctionId: "orders.refund-order",
        config: { method: "POST", path: "/orders/:orderId/refund", auth: { kind: "required" } },
      },
    },
    {
      id: "route.get.orders",
      kind: "trigger",
      label: "GET /orders",
      meta: {
        triggerType: "http",
        config: { method: "GET", path: "/orders", auth: { kind: "required" } },
      },
    },
  ],
  edges: [],
  declaredEdges: [],
  observedEdges: [],
} as unknown as GraphSnapshot;

test("a route shows its auth requirement and its function's access rule", () => {
  const hierarchy = buildHierarchy(snapshot);
  const refund = routeAccess(hierarchy, hierarchy.nodes.get("route.post.refund")!);
  expect({ ...refund, summary: describeAccessRule(refund.rule!) }).toMatchSnapshot();
  expect(routeAccess(hierarchy, hierarchy.nodes.get("route.get.orders")!)).toEqual({
    session: true,
    role: false,
    middleware: [],
  });
});

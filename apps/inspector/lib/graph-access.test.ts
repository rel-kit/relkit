/** Route authentication and function access rules in the explorer's access section. */
import { expect, test } from "bun:test";
import type { GraphSnapshot } from "./graph-model";
import { buildHierarchy, routeAccess } from "./graph-hierarchy";
import { describeAccessRule } from "./graph-hierarchy-access";
import { architectureView } from "./graph-views";

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

/** NF-15: route cards must not call routes "public" when the graph shows no rule. */
const routeGroup = (functionMeta?: Record<string, unknown>) =>
  architectureView(
    buildHierarchy({
      nodes: [
        {
          id: "fleet.list-vehicles",
          kind: "function",
          label: "listVehicles",
          ...(functionMeta === undefined ? {} : { meta: functionMeta }),
        },
        {
          id: "route.get.vehicles",
          kind: "trigger",
          label: "GET /vehicles",
          meta: {
            triggerType: "http",
            targetFunctionId: "fleet.list-vehicles",
            config: { method: "GET", path: "/vehicles", auth: null },
          },
        },
      ],
      edges: [],
      declaredEdges: [],
      observedEdges: [],
    } as unknown as GraphSnapshot),
  ).nodes.find((node) => node.category === "route");

test("a route group counts a route as protected when its function declares an access rule", () => {
  expect(routeGroup({ access: { permissions: ["vehicle:read"] } })?.subtitle).toBe(
    "1 route · all protected",
  );
});

test("a route group whose graph shows no rule is not called public", () => {
  expect(routeGroup()?.subtitle).toBe("1 route · no access rule reported");
});

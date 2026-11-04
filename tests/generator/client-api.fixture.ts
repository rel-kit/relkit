import { GRAPH_VERSION } from "relkit/contracts";
import type { ApplicationGraph } from "relkit/graph";

const source = { file: "src/services/orders/service.ts", line: 1, column: 1 };
const orderId = {
  type: "object",
  required: ["orderId"],
  properties: { orderId: { type: "string" } },
};
const order = {
  type: "object",
  required: ["orderId", "totalCents"],
  properties: { orderId: { type: "string" }, totalCents: { type: "number" } },
};

/** Builds one public function node.
 * @param id - Function ID, `<service>.<name>`.
 * @param input - Input JSON Schema.
 * @param output - Output JSON Schema.
 * @param errors - Declared errors.
 * @returns The graph node.
 */
function fn(id: string, input: unknown, output: unknown, errors: unknown[] = []) {
  return { kind: "function", invocationMode: "callable", id, source, input, output, errors };
}

/** Builds one HTTP route node.
 * @param id - Trigger ID.
 * @param method - HTTP method.
 * @param path - Route path.
 * @param target - Target function ID.
 * @param operation - Client operation.
 * @param responses - Declared error responses.
 * @returns The graph node.
 */
function route(
  id: string,
  method: string,
  path: string,
  target: string,
  operation: "query" | "mutation",
  responses: unknown[] = [],
) {
  return {
    kind: "trigger",
    id,
    triggerType: "http",
    targetFunctionId: target,
    source,
    config: {
      method,
      path,
      client: { operation },
      request: { kind: "input", fields: {} },
      responses: [{ kind: "success", id: "success.200", status: 200 }, ...responses],
      middleware: [],
      transforms: [],
    },
  };
}

/** A small commerce-like application: two services, shared targets, a stream and declared errors.
 * @returns The application graph.
 */
export function clientApiGraph(): ApplicationGraph {
  const notFound = {
    kind: "error",
    id: "orders.not-found",
    data: orderId,
    http: { status: 404 },
    retry: "never",
  };
  const declined = {
    kind: "error",
    id: "orders.payment-declined",
    data: { type: "object", required: ["reason"], properties: { reason: { type: "string" } } },
    http: { status: 402 },
    retry: "never",
  };
  const notFoundResponse = {
    kind: "error",
    id: "error.orders.not-found.404",
    errorId: "orders.not-found",
    status: 404,
  };
  return {
    contractVersion: GRAPH_VERSION,
    nodes: [
      fn("orders.get-order", orderId, order, [notFound]),
      fn(
        "orders.search-orders",
        { type: "object", properties: {} },
        {
          type: "object",
          required: ["count"],
          properties: { count: { type: "number" } },
        },
      ),
      fn("orders.price-order", orderId, order, [notFound, declined]),
      fn(
        "orders.stream-report",
        { type: "object", properties: {} },
        {
          kind: "stream",
          item: {
            type: "object",
            required: ["completed"],
            properties: { completed: { type: "number" } },
          },
        },
      ),
      fn(
        "account.account-session",
        { type: "object", properties: {} },
        {
          type: "object",
          required: ["userId"],
          properties: { userId: { type: "string" } },
        },
      ),
      route(
        "route.get.orders.by-order-id",
        "GET",
        "/orders/:orderId",
        "orders.get-order",
        "query",
        [notFoundResponse],
      ),
      route(
        "route.head.orders.by-order-id",
        "HEAD",
        "/orders/:orderId",
        "orders.get-order",
        "query",
      ),
      route("route.get.orders", "GET", "/orders", "orders.search-orders", "query"),
      route("route.get.orders.search", "GET", "/orders/search", "orders.search-orders", "query"),
      route(
        "route.post.orders.price",
        "POST",
        "/orders/:orderId/price",
        "orders.price-order",
        "mutation",
        [
          notFoundResponse,
          {
            kind: "error",
            id: "error.orders.payment-declined.402",
            errorId: "orders.payment-declined",
            status: 402,
          },
        ],
      ),
      route("route.get.reports", "GET", "/reports", "orders.stream-report", "query"),
      route(
        "route.get.account.profile",
        "GET",
        "/account/profile",
        "account.account-session",
        "query",
      ),
    ],
    edges: [],
  } as unknown as ApplicationGraph;
}

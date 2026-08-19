import { describe, expect, test } from "bun:test";
import { collectRouteFields, composeRouteRequest } from "./route-composer";
import { openApiOperation } from "./route-openapi";

const mapping = {
  kind: "input",
  fields: {
    orderId: { kind: "path", name: "orderId" },
    note: { kind: "optional", value: { kind: "query", name: "note" } },
    quantity: { kind: "body", name: "quantity" },
  },
};

describe("route composer contract", () => {
  test("extracts mapped fields and builds the active route request", async () => {
    expect(collectRouteFields(mapping)).toEqual([
      { key: "orderId", source: "path", name: "orderId", required: true },
      { key: "note", source: "query", name: "note", required: false },
      { key: "quantity", source: "body", name: "quantity", required: true },
    ]);
    const result = composeRouteRequest(
      { method: "POST", path: "/orders/:orderId", request: mapping },
      { orderId: "order/1", quantity: "2" },
    );
    expect(result.ok).toBe(true);
    expect(result.path).toBe("/orders/order%2F1");
    expect(result.init?.method).toBe("POST");
    expect(await new Response(result.init?.body).json()).toEqual({ quantity: "2" });
  });

  test("reports missing values and derives an OpenAPI operation", () => {
    const missing = composeRouteRequest(
      { method: "GET", path: "/orders/:orderId", request: mapping },
      {},
    );
    expect(missing.ok).toBe(false);
    expect(missing.errors.map((item) => item.key)).toEqual(["orderId", "quantity"]);
    const operation = openApiOperation(
      {
        id: "orders.get",
        targetFunctionId: "orders.lookup",
        config: { request: mapping, responses: [{ status: 200, kind: "success" }] },
      },
      { input: { type: "object" } },
    );
    expect(operation.operationId).toBe("orders.get");
    expect(operation.parameters).toEqual(
      expect.arrayContaining([
        { name: "orderId", in: "path", required: true, schema: { type: "string" } },
      ]),
    );
  });
});

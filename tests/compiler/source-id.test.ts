import { describe, expect, test } from "bun:test";
import {
  encodeErrorId,
  encodeExportId,
  encodeMemberId,
  encodeRouteId,
  encodeSourceHierarchy,
} from "../../packages/compiler/src/index.ts";

describe("source-scoped ID encoders", () => {
  test("strips conventional source structure and normalizes hierarchy", () => {
    expect(encodeSourceHierarchy("src\\orders\\functions\\getOrder.function.ts", "function")).toBe(
      "orders.get-order",
    );
    expect(encodeSourceHierarchy("src/orders/service.ts", "service")).toBe("orders");
    expect(encodeSourceHierarchy("src/orders/functions/index.ts", "function")).toBe("orders");
  });

  test("uses named bindings, default file stems, and explicit IDs", () => {
    expect(
      encodeExportId({
        source: "src/orders/functions/get-order.function.ts",
        kind: "function",
        invocationMode: "callable",
        exportName: "getOrder",
        exportKind: "named",
        binding: "getOrder",
      }),
    ).toBe("orders.get-order");
    expect(
      encodeExportId({
        source: "src/orders/functions/get-order.function.ts",
        kind: "function",
        invocationMode: "callable",
        exportName: "default",
        exportKind: "default",
      }),
    ).toBe("orders.get-order");
    expect(
      encodeExportId({
        source: "src/orders/functions/get-order.function.ts",
        kind: "function",
        invocationMode: "callable",
        exportName: "getOrder",
        exportKind: "named",
        binding: "getOrder",
        explicitId: "orders.custom_id",
      }),
    ).toBe("orders.custom_id");
  });

  test("encodes errors and service members with explicit precedence", () => {
    expect(encodeErrorId("src/orders/errors/order.error.ts", "InvalidError")).toBe(
      "orders.order.InvalidError",
    );
    expect(
      encodeErrorId("src/orders/errors/order.error.ts", "InvalidError", "orders.invalid"),
    ).toBe("orders.invalid");
    expect(encodeMemberId("orders", "getOrder")).toBe("orders.get-order");
    expect(encodeMemberId("orders", "getOrder", "orders.lookup")).toBe("orders.lookup");
  });

  test("encodes route method and path variants without transport punctuation", () => {
    expect(encodeRouteId("GET", "/orders/:orderId")).toBe("route.get.orders.by-order-id");
    expect(encodeRouteId("POST", "/")).toBe("route.post.root");
    expect(encodeRouteId("GET", "/files/*parts")).toBe("route.get.files.catch-all-parts");
    expect(encodeRouteId("GET", "/files/*parts?")).toBe("route.get.files.optional-catch-all-parts");
    expect(encodeRouteId("GET", "/orders/:orderId", "orders.read.http")).toBe("orders.read.http");
  });
});

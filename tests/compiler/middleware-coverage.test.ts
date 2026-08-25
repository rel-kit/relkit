import { describe, expect, test } from "bun:test";
import { pathRelation } from "../../packages/compiler/src/middleware-coverage";

describe("middleware route coverage", () => {
  test("classifies exact, parameter, wildcard, global, unmatched, and partial catch-all paths", () => {
    expect(pathRelation("/orders/42", "/orders/42")).toBe("always");
    expect(pathRelation("/orders/:id", "/orders/:orderId")).toBe("always");
    expect(pathRelation("/orders/42", "/orders/:orderId")).toBe("conditional");
    expect(pathRelation("/orders/*", "/orders/:orderId/details")).toBe("always");
    expect(pathRelation("*", "/health")).toBe("always");
    expect(pathRelation("/auth/*", "/orders/:orderId")).toBeUndefined();
    expect(pathRelation("/orders/special", "/orders/:parts{.+}")).toBe("conditional");
  });
});

import { describe, expect, test } from "bun:test";
import { functionCaptures } from "./function-capture";

const at = "2026-01-01T00:00:00.000Z";
const request = { requestId: "r", functionId: "orders.create", routeId: "orders.create.http" };
const root = { signal: "span", spanId: "root", name: "HTTP POST /orders", startedAt: at };
const invocation = (extra: Record<string, unknown> = {}) => ({
  signal: "span",
  spanId: "fn",
  parentSpanId: "root",
  functionId: "orders.create",
  name: "relkit.invoke.orders.create",
  startedAt: at,
  ...extra,
});

describe("the invocation's captured input and result", () => {
  test("reads both captures from the function span", () => {
    const view = functionCaptures(request, [
      root,
      invocation({
        inputCapture: {
          mode: "development-redacted",
          bytes: 24,
          truncated: false,
          content: { sku: "a", token: "[redacted]" },
        },
        outputCapture: {
          mode: "development-redacted",
          bytes: 12,
          truncated: false,
          content: { orderId: "o-1" },
        },
      }),
    ]);
    expect(view?.functionId).toBe("orders.create");
    expect(view?.input).toEqual({
      state: "captured",
      content: { sku: "a", token: "[redacted]" },
      bytes: 24,
    });
    expect(view?.output).toEqual({ state: "captured", content: { orderId: "o-1" }, bytes: 12 });
  });

  test("takes the capture from whichever revision of the span has it", () => {
    const view = functionCaptures(request, [
      invocation({ revision: 1 }),
      invocation({
        revision: 2,
        outputCapture: { mode: "development-redacted", bytes: 2, truncated: false, content: [] },
      }),
    ]);
    expect(view?.output.state).toBe("captured");
    expect(view?.input.state).toBe("off");
  });

  test("a value over the limit is reported as truncated, with the limit", () => {
    const view = functionCaptures(request, [
      invocation({
        inputCapture: { mode: "development-redacted", bytes: 65536, truncated: true },
      }),
    ]);
    expect(view?.input).toEqual({ state: "truncated", limit: 65536 });
  });

  test("a function that took or returned nothing is reported as empty", () => {
    const view = functionCaptures(request, [
      invocation({
        outputCapture: { mode: "development-redacted", bytes: 0, truncated: false },
      }),
    ]);
    expect(view?.output).toEqual({ state: "empty" });
  });

  test("without a capture record the capture is off", () => {
    const view = functionCaptures(request, [root, invocation()]);
    expect(view?.input).toEqual({ state: "off" });
    expect(view?.output).toEqual({ state: "off" });
  });

  test("a request with no function span has nothing to show", () => {
    expect(functionCaptures({ requestId: "r", routeId: "relkit.auth" }, [root])).toBeUndefined();
    expect(functionCaptures(request, [root])).toBeUndefined();
  });

  test("prefers the span of the request's own function over a nested one", () => {
    const nested = {
      signal: "span",
      spanId: "nested",
      parentSpanId: "fn",
      functionId: "prices.get",
      startedAt: at,
      inputCapture: { mode: "development-redacted", bytes: 2, truncated: false, content: "x" },
    };
    const view = functionCaptures(request, [nested, invocation()]);
    expect(view?.functionId).toBe("orders.create");
    expect(view?.input.state).toBe("off");
  });

  test("reads the invocation span, not the HTTP route span that also carries the function id", () => {
    const route = {
      signal: "span",
      spanId: "route",
      name: "HTTP POST /orders",
      functionId: "orders.create",
      startedAt: "2025-12-31T23:59:59.000Z",
    };
    const view = functionCaptures(request, [
      route,
      invocation({
        inputCapture: { mode: "development-redacted", bytes: 9, truncated: false, content: "in" },
      }),
    ]);
    expect(view?.input).toEqual({ state: "captured", content: "in", bytes: 9 });
  });

  test("a route span without an invocation span means no function ran", () => {
    const route = {
      signal: "span",
      spanId: "route",
      name: "HTTP POST /orders",
      functionId: "orders.create",
    };
    expect(functionCaptures(request, [route])).toBeUndefined();
  });
});

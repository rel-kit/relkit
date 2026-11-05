import { expect, test } from "bun:test";
import { api, apiRoutePath, createApi, RelkitNetworkError } from "../src/index.ts";
import { mockFetch } from "./fixtures/fetch.ts";

type Tree = Record<string, Record<string, unknown>>;

test("api properties are stable references to their route paths", () => {
  const tree = api as unknown as Tree;
  const route = tree.orders!.priceOrder as never;
  expect(apiRoutePath(route)).toEqual(["orders", "priceOrder"]);
  expect(tree.orders!.priceOrder).toBe(tree.orders!.priceOrder);
  expect((tree.orders as { then?: unknown }).then).toBeUndefined();
  expect(() => apiRoutePath({} as never)).toThrow("generated `api` object");
});

test("createApi calls a route at its REST endpoint and keeps declared error fields", async () => {
  const requests: string[] = [];
  const backend = createApi({
    baseUrl: "http://relkit.test",
    fetch: mockFetch(async (input, init) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      requests.push(`${init?.method ?? "GET"} ${url.pathname}${url.search}`);
      if (url.pathname === "/_relkit/v1/client/routes")
        return Response.json({ protocol: "relkit.client-routes", version: 1, routes });
      if (url.pathname === "/orders/o2")
        return Response.json(
          {
            type: "/errors/orders.not-found",
            title: "Not Found",
            status: 404,
            code: "orders.not-found",
            detail: "Order not found",
            data: { orderId: "o2" },
          },
          { status: 404, headers: { "content-type": "application/problem+json" } },
        );
      return Response.json({ totalCents: 1200 });
    }),
  }) as unknown as Record<string, Record<string, (input: unknown) => Promise<unknown>>>;
  expect(await backend.orders!.priceOrder!({ orderId: "o1", currency: "EUR" })).toEqual({
    totalCents: 1200,
  });
  expect(apiRoutePath(backend.orders!.priceOrder as never)).toEqual(["orders", "priceOrder"]);
  const error = await backend.orders!.priceOrder!({ orderId: "o2" }).catch(
    (cause: unknown) => cause,
  );
  expect(error).toMatchObject({
    code: "orders.not-found",
    status: 404,
    message: "Order not found",
    data: { orderId: "o2" },
  });
  expect(requests).toEqual([
    "GET /_relkit/v1/client/routes",
    "GET /orders/o1?currency=EUR",
    "GET /orders/o2",
  ]);
});

const routes = [
  {
    id: "route.get.orders.by-order-id",
    api: ["orders", "priceOrder"],
    method: "GET",
    path: "/orders/:orderId",
    request: {
      kind: "input",
      fields: {
        orderId: { kind: "path", name: "orderId" },
        currency: { kind: "optional", value: { kind: "query", name: "currency" } },
      },
    },
    stream: null,
    operation: "query",
    errors: ["orders.not-found"],
  },
];

test("a request without a response becomes a NETWORK_ERROR", async () => {
  const backend = createApi({
    baseUrl: "http://relkit.test",
    fetch: mockFetch(async () => {
      throw new TypeError("fetch failed");
    }),
  }) as unknown as Record<string, Record<string, (input: unknown) => Promise<unknown>>>;
  const error = await backend.orders!.priceOrder!({}).catch((cause: unknown) => cause);
  expect(error).toBeInstanceOf(RelkitNetworkError);
  expect(error).toMatchObject({ code: "NETWORK_ERROR", status: 0, defined: false });
});

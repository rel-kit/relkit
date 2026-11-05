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

test("createApi calls a route at its API path and keeps declared error fields", async () => {
  const requests: string[] = [];
  const backend = createApi({
    baseUrl: "http://relkit.test",
    fetch: mockFetch(async (input) => {
      const url = String(input instanceof Request ? input.url : input);
      requests.push(new URL(url).pathname);
      if (url.endsWith("/missing"))
        return Response.json(
          {
            json: {
              defined: true,
              code: "orders.not-found",
              status: 404,
              message: "Order not found",
              data: { orderId: "o2" },
            },
          },
          { status: 404 },
        );
      return Response.json({ json: { totalCents: 1200 } });
    }),
  }) as unknown as Record<string, Record<string, (input: unknown) => Promise<unknown>>>;
  expect(await backend.orders!.priceOrder!({ orderId: "o1" })).toEqual({ totalCents: 1200 });
  expect(apiRoutePath(backend.orders!.priceOrder as never)).toEqual(["orders", "priceOrder"]);
  const error = await backend.orders!.missing!({}).catch((cause: unknown) => cause);
  expect(error).toMatchObject({
    code: "orders.not-found",
    status: 404,
    data: { orderId: "o2" },
  });
  expect(requests).toEqual(["/rpc/api/orders/priceOrder", "/rpc/api/orders/missing"]);
});

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

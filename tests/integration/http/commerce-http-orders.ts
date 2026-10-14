/** Exercises Orders mappings and HTTP methods under the owned grouped fixture. */
import { expect } from "bun:test";
import { Effect } from "effect";
import type { CommerceHttpFixture } from "./commerce-http.types.ts";
/**
 * Checks creation, lookup and static-route precedence.
 * @param fixture - Native client and invocation observations.
 * @returns Completion after creation and read assertions.
 */
export const verifyOrderReads = Effect.fn("test.commerce.http.reads")(function* ({
  client,
  invocations,
}: CommerceHttpFixture) {
  const created = yield* Effect.tryPromise(() =>
    client.post("/orders", {
      headers: {
        "content-type": "application/json",
        "idempotency-key": "order-1",
        "x-customer-email": "customer@example.com",
      },
      body: JSON.stringify({ sku: "sku-1", quantity: 2 }),
    }),
  );
  expect(created.status).toBe(201);
  expect(yield* Effect.tryPromise(() => created.json())).toEqual({
    orderId: "order-1",
    receiptKey: "order-1.json",
    totalCents: 2000,
  });
  const fetched = yield* Effect.tryPromise(() =>
    client.get("/orders/order-1", { headers: { authorization: "Bearer fixture" } }),
  );
  expect(fetched.status).toBe(200);
  expect(yield* Effect.tryPromise(() => fetched.json())).toEqual({
    orderId: "order-1",
    status: "confirmed",
    totalCents: 1000,
  });
  const searched = yield* Effect.tryPromise(() => client.get("/orders/search?status=confirmed"));
  expect(yield* Effect.tryPromise(() => searched.json())).toEqual({
    status: "confirmed",
    count: 1,
  });
  expect(invocations.at(-1)?.functionId).toBe("orders.search-orders");
  expect((yield* Effect.tryPromise(() => client.get("/orders?status=open"))).status).toBe(200);
});
/**
 * Checks update, delete and bodyless methods.
 * @param fixture - Native route client.
 * @returns Completion after every asserted method settles.
 */
export const verifyOrderMethods = Effect.fn("test.commerce.http.methods")(function* ({
  client,
}: CommerceHttpFixture) {
  for (const method of ["PUT", "PATCH"] as const) {
    const response = yield* Effect.tryPromise(() =>
      client.request("/orders/order-2", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: method === "PUT" ? "replaced" : "patched" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(yield* Effect.tryPromise(() => response.json())).toMatchObject({ orderId: "order-2" });
  }
  const deleted = yield* Effect.tryPromise(() => client.delete("/orders/order-2?reason=duplicate"));
  expect(deleted.status).toBe(202);
  expect(yield* Effect.tryPromise(() => deleted.json())).toEqual({
    orderId: "order-2",
    deleted: true,
  });
  const head = yield* Effect.tryPromise(() =>
    client.request("/orders/order-3", { method: "HEAD" }),
  );
  expect(head.status).toBe(200);
  expect(yield* Effect.tryPromise(() => head.text())).toBe("");
  expect(
    (yield* Effect.tryPromise(() => client.request("/orders/order-3", { method: "OPTIONS" })))
      .status,
  ).toBe(200);
});

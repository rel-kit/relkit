"use client";

/** Calls both commerce service-route methods using their generated domain inputs inside the frontend provider. */
import { useRelkitClient, useRoute, useRouteMutation } from "@relkit/client/react";

/** Reads the Orders search count and submits one explicit creation without replaying a failed write.
 * @returns Typed query results, creation feedback, and an action available after identity is ready. */
export function Orders() {
  const { status } = useRelkitClient();
  const orders = useRoute("GET /orders", { input: { status: "pending" } });
  const create = useRouteMutation("POST /orders");

  return (
    <section>
      {orders.isPending && <p role="status">Loading orders…</p>}
      {orders.data && <p>{orders.data.count} orders</p>}
      {orders.isError && <p role="alert">{orders.error.message}</p>}
      <button
        disabled={status !== "ready" || !create.isIdle}
        onClick={() =>
          create.mutate({
            orderId: crypto.randomUUID(),
            customerEmail: "reader@example.com",
            sku: "book",
            quantity: 1,
          })
        }
      >
        Create an order
      </button>
      {create.isPending && <p role="status">Creating…</p>}
      {create.isSuccess && <p>Created: {create.data.orderId}</p>}
      {create.isError && (
        <p role="alert">{create.error.message}. Check the outcome before retrying.</p>
      )}
    </section>
  );
}

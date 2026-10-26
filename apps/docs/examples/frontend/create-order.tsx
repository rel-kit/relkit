"use client";

/** Calls the API example's Orders function through its public route, retaining the generated input and price result. */
import { useRelkitClient, useRouteMutation } from "@relkit/client/react";

/** Creates one order in the API example without importing the backend service.
 * @returns A guarded submission action and its typed price or failure. */
export function CreateOrder() {
  const { status } = useRelkitClient();
  const create = useRouteMutation("POST /orders");

  return (
    <section>
      <button
        disabled={status !== "ready" || !create.isIdle}
        onClick={() => create.mutate({ orderId: crypto.randomUUID(), sku: "book", quantity: 2 })}
      >
        Create an order
      </button>
      {create.isPending && <p role="status">Creating…</p>}
      {create.isSuccess && <p>Total: {create.data.totalCents} cents</p>}
      {create.isError && (
        <p role="alert">{create.error.message}. Check the outcome before retrying.</p>
      )}
    </section>
  );
}

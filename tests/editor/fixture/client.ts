/** Generated client, typed by the generated client registry. */
import { createApi } from "@relkit/client";

const backend = createApi({ baseUrl: "http://127.0.0.1:4000" });

export async function placeOrder(): Promise<number> {
  const order = await backend.orders.createOrder({ orderId: "1", sku: "a", quantity: 1 });
  return order.totalCents;
}

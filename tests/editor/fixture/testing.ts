/** Test helpers of `@relkit/testing`. */
import { createTestApplication, invokeFunction } from "@relkit/testing";
import createOrder from "./create-order.function.js";
import config from "./relkit.config.js";

export async function unit(): Promise<number> {
  const order = await invokeFunction(createOrder, { orderId: "1", sku: "a", quantity: 1 });
  return order.totalCents;
}

export async function integration(): Promise<number> {
  const app = await createTestApplication(config, { projectRoot: "." });
  const response = await app.http.post<{ totalCents: number }>("/orders", { json: { sku: "a" } });
  return (await response.json()).totalCents;
}

/** Runtime handle: inside the application and from a script. */
import { createRelkit, getRelkit } from "relkit";
import config from "./relkit.config.js";

export async function insideTheApplication(): Promise<void> {
  const relkit = getRelkit();
  await relkit.functions.orders.createOrder({ orderId: "1", sku: "a", quantity: 1 });
}

export async function fromAScript(): Promise<void> {
  const relkit = await createRelkit(config);
  await relkit.functions.orders.createOrder({ orderId: "1", sku: "a", quantity: 1 });
  await relkit.close();
}

/** Seeds commerce's local data through the built application: a user row, an order lookup and an agent reply. */
import { createRelkit } from "relkit";
import config from "../relkit.config.js";

// Activates the providers from `.relkit/build`; nothing listens for requests.
const relkit = await createRelkit(config);

try {
  // The default database: the same models handlers reach through `context.database`.
  const user = await relkit.database.users.upsert({
    where: { email: "ada@example.com" },
    create: { email: "ada@example.com" },
    update: {},
  });

  // Functions are grouped by service ID and member name.
  const order = await relkit.functions.orders.getOrder({ orderId: "order-1" });

  // Agents are keyed by their ID.
  const reply = await relkit.agents["orders.order-support"]({
    message: `Summarize order ${order.orderId} for ${user.email}.`,
  });

  console.log(reply.answer);
} finally {
  // Releases every provider the handle started, so the script can exit.
  await relkit.close();
}

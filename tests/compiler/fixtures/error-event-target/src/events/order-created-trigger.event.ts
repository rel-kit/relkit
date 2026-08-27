import { onEvent } from "@relkit/app";

const trigger = onEvent("orders.missing", async () => undefined, {
  id: "orders.created-trigger",
});

export default trigger;

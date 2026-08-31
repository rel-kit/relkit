import { defineEvent } from "@relkit/app";
import { z } from "@relkit/schema";

const orderCreated = defineEvent({
  id: "orders.created",
  version: 1,
  input: z.object({ id: z.string() }),
});

export default orderCreated;

import { defineEvent } from "@zsys/app";
import { z } from "@zsys/schema";

const orderCreated = defineEvent({
  id: "orders.created",
  version: 1,
  payload: z.object({ id: z.string() }),
});

export default orderCreated;

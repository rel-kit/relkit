/** Carries the missing order identity from lookup to an HTTP 404 with the established one-second retry hint. */
import { defineError } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";

const orderNotFound = defineError({
  id: "orders.not-found",
  data: z.object({
    /** Requested order identity preserved in the public failure message and payload. */
    orderId: z.string(),
  }),
  message: ({ orderId }) => `Order ${orderId} was not found`,
  http: { status: 404 },
  retry: { kind: "later", afterMs: 1_000 },
});

export default orderNotFound;

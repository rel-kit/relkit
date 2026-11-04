import { defineError } from "relkit";
import { z } from "relkit/schema";

const NotFoundError = defineError({
  data: z.object({ orderId: z.string() }),
  message: ({ orderId }) => `Order ${orderId} was not found`,
  http: { status: 404 },
});

export default NotFoundError;

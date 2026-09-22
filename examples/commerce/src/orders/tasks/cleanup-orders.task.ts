import { defineTask } from "@relkit/app/tasks";
import { z } from "@relkit/app/schema";
import { removeOrdersBefore } from "@app/orders/helpers/fake-business.js";
import { sendFakeMail } from "@app/orders/helpers/fake-mail.js";

const cleanupOrders = defineTask({
  id: "orders.cleanup",
  version: "1",
  execution: "retryable",
  input: z.object({ before: z.string() }),
  output: z.object({ removed: z.number().int().nonnegative() }),
  handler: async ({ before }) => {
    const removed = removeOrdersBefore(before);
    sendFakeMail({
      idempotencyKey: `cleanup:${before}`,
      to: "ops@example.test",
      subject: `Removed ${removed} cancelled orders`,
    });
    return { removed };
  },
});

export default cleanupOrders;

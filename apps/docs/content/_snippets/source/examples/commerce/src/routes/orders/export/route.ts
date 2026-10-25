/**
 * Accepts an order export through the public orders service and returns its durable
 * run receipt. The service owns the job descriptor; this route owns HTTP transport.
 */
import { defineRoute } from "@relkit/app/routes";
import orders from "../../../services/orders/service.js";

export const POST = defineRoute({
  id: "orders.export",
  handler: async (request) => {
    const input = (await request.json()) as { readonly orderIds: string[] };
    const run = await orders.exportOrders.trigger(input);
    return Response.json(run, { status: 202 });
  },
});

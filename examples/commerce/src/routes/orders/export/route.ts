import { defineRoute } from "@relkit/app/routes";
import exportOrders from "@app/orders/jobs/export-orders.job.js";

export const POST = defineRoute({
  id: "orders.export",
  handler: async (request) => {
    const input = (await request.json()) as { readonly orderIds: string[] };
    const run = await exportOrders.trigger(input);
    return Response.json(run, { status: 202 });
  },
});

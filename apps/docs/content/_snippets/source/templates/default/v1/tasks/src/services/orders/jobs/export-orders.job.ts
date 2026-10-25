/** Registers the export task as a public job exposing trigger, lookup, list and watch with progress/output fields. */
import { defineJob } from "@relkit/app/jobs";
import exportOrders from "@app/services/orders/tasks/export-orders.task.js";

const exportOrdersJob = defineJob({
  id: "orders.export-orders-job",
  name: "exportOrders",
  task: exportOrders,
  client: {
    public: true,
    operations: ["trigger", "get", "list", "watch"],
    fields: ["status", "progress", "output"],
  },
});

export default exportOrdersJob;

import { defineJob } from "@relkit/app/jobs";
import exportOrders from "@app/orders/tasks/export-orders.task.js";

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

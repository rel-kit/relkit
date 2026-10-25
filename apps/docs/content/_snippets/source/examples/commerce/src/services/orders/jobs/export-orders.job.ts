/** Registers the export task as a public job exposing trigger, get, list and watch with progress/output fields. */
import { defineJob } from "@relkit/app/jobs";
import exportOrders from "../tasks/export-orders.task.js";

const exportOrdersJob = defineJob({
  name: "exportOrders",
  id: "orders.export-orders",
  task: exportOrders,
  client: {
    public: true,
    operations: ["trigger", "get", "list", "watch"],
    fields: ["status", "progress", "output"],
  },
});

export default exportOrdersJob;

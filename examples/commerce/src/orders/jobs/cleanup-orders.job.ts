import { defineJob } from "@relkit/app/jobs";
import cleanupOrders from "@app/orders/tasks/cleanup-orders.task.js";

const cleanupOrdersJob = defineJob({
  name: "cleanupOrders",
  id: "orders.cleanup",
  task: cleanupOrders,
  schedules: [
    {
      id: "dailyCleanup",
      cron: "0 0 * * *",
      timezone: "UTC",
      input: { before: "30 days ago" },
      misfire: "skip",
    },
  ],
});

export default cleanupOrdersJob;

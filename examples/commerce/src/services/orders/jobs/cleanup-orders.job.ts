/** Schedules the cleanup task daily at midnight UTC with the established input and skip-misfire policy. */
import { defineJob } from "@relkit/app/jobs";
import cleanupOrders from "../tasks/cleanup-orders.task.js";

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

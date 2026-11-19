/** Public job over the export task. */
import { defineJob } from "relkit/jobs";
import exportOrders from "./export.task.js";

export default defineJob({
  name: "exportOrders",
  id: "orders.export",
  task: exportOrders,
  client: { public: true, operations: ["trigger", "get"], fields: ["status", "output"] },
});

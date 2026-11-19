/** Service that owns the order function, task and job. */
import { defineService } from "relkit/services";
import createOrder from "./create-order.function.js";
import exportOrdersJob from "./export.job.js";
import exportOrders from "./export.task.js";

export default defineService({
  functions: { createOrder },
  tasks: { exportOrders },
  jobs: { exportOrdersJob },
});

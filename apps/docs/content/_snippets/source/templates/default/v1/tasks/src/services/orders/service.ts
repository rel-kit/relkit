/** Declares the orders service boundary and its public members. */
import { defineService } from "@relkit/app/services";
import exportOrders from "@app/services/orders/jobs/export-orders.job.js";
import exportOrdersTask from "@app/services/orders/tasks/export-orders.task.js";
import health from "@app/services/orders/functions/health.function.js";

export default defineService({
  functions: { health },
  tasks: { exportOrdersTask },
  jobs: { exportOrders },
});

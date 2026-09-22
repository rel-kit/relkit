import { defineService } from "@relkit/app/services";
import exportOrders from "@app/orders/jobs/export-orders.job.js";
import exportOrdersTask from "@app/orders/tasks/export-orders.task.js";
import health from "@app/orders/functions/health.function.js";

export default defineService({
  functions: { health },
  tasks: { exportOrdersTask },
  jobs: { exportOrders },
});

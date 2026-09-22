import { defineService } from "@relkit/app/services";
import createOrder from "./functions/create-order.function.js";
import deleteOrder from "./functions/delete-order.function.js";
import getOrder from "./functions/get-order.function.js";
import searchOrders from "./functions/search-orders.function.js";
import updateOrder from "./functions/update-order.function.js";
import authorizeOrder from "./functions/authorize-order.function.js";
import streamOrderReport from "./functions/stream-order-report.function.js";
import cleanupOrders from "./jobs/cleanup-orders.job.js";
import exportOrders from "./jobs/export-orders.job.js";
import cleanupOrdersTask from "./tasks/cleanup-orders.task.js";
import exportOrdersTask from "./tasks/export-orders.task.js";

export default defineService({
  functions: {
    createOrder,
    deleteOrder,
    getOrder,
    searchOrders,
    updateOrder,
    authorizeOrder,
    streamOrderReport,
  },
  tasks: { cleanupOrdersTask, exportOrdersTask },
  jobs: { cleanupOrders, exportOrders },
});

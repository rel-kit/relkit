/** Exposes the orders functions, event and task, each built with a different schema library. */
import { defineService } from "relkit/services";
import checkStock from "./functions/check-stock.function.js";
import placeOrder from "./functions/place-order.function.js";
import quoteOrder from "./functions/quote-order.function.js";
import trackShipment from "./functions/track-shipment.function.js";
import orderPlaced from "./events/order-placed.event.js";
import { shipOrder } from "./tasks/ship-order.task.js";

export default defineService({
  functions: { quoteOrder, checkStock, placeOrder, trackShipment },
  events: { orderPlaced },
  tasks: { shipOrder },
});

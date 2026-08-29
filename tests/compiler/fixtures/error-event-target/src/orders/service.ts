import { defineService } from "@relkit/app";
import orderCreated from "./events/order-created.event.js";
import handleEvent from "./functions/handle-event.function.js";

export default defineService({
  functions: { handleEvent },
  events: { orderCreated },
});

import { defineRoute } from "@relkit/app/routes";
import orders from "@app/services/orders.service.js";

export const POST = defineRoute({
  // Reuse the checked application function instead of duplicating HTTP logic.
  target: orders.createOrder,
  // Successful creates return the conventional HTTP 201 status.
  successStatus: 201,
});

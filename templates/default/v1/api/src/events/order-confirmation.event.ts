import { onEvent } from "@relkit/app/events";

const orderConfirmation = onEvent(
  "orders.created",
  async (payload, context) => {
    context.log.info("order.confirmation.requested", { orderId: payload.orderId });
  },
  { id: "orders.confirmation" },
);

export default orderConfirmation;

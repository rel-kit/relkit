import { defineEventFunction } from "@relkit/app";

const trigger = defineEventFunction({
  id: "orders.created-trigger",
  event: "orders.missing",
  handler: async () => {},
});

export default trigger;

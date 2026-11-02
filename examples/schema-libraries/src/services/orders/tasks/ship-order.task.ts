/** Ships a placed order in the background; its input and output are Effect Schema schemas. */
import { defineTask } from "@relkit/app/tasks";
import { Schema } from "effect";

export const shipOrder = defineTask({
  id: "orders.ship-order",
  version: "1",
  execution: "durable",
  input: Schema.toStandardSchemaV1(Schema.Struct({ orderId: Schema.String })),
  output: Schema.toStandardSchemaV1(Schema.Struct({ trackingNumber: Schema.String })),
  handler: async ({ orderId }) => ({ trackingNumber: `track-${orderId}` }),
});

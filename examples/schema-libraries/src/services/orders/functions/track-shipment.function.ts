/** Reports a shipment's status; its input and output are Effect Schema schemas. */
import { defineFunction } from "@relkit/app/functions";
import { Schema } from "effect";

export default defineFunction({
  id: "orders.track-shipment",
  input: Schema.toStandardSchemaV1(Schema.Struct({ orderId: Schema.String })),
  output: Schema.toStandardSchemaV1(
    Schema.Struct({
      orderId: Schema.String,
      status: Schema.Literals(["pending", "shipped", "delivered"]),
    }),
  ),
  handler: async ({ orderId }) => ({ orderId, status: "pending" as const }),
});

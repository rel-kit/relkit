import { defineFunction } from "@relkit/app";
import { eventEnvelope } from "../../platform/schemas.js";

const handleCreated = defineFunction({
  id: "orders.handle-created",
  input: eventEnvelope,
  output: eventEnvelope,
  handler: async (input) => input,
});

export default handleCreated;

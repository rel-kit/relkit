import { defineFunction } from "@zsys/app";
import { z } from "@zsys/schema";

const getOrder = defineFunction({
  id: "collision.get",
  input: z.object({ id: z.string() }),
  output: z.object({ id: z.string() }),
  handler: async (input) => input,
});

export default getOrder;

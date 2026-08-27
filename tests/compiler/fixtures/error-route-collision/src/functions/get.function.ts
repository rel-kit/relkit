import { defineFunction } from "@relkit/app";
import { z } from "@relkit/schema";

const getOrder = defineFunction({
  id: "collision.get",
  input: z.object({ id: z.string() }),
  output: z.object({ id: z.string() }),
  handler: async (input) => input,
});

export default getOrder;

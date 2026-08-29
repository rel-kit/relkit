import { defineFunction } from "@relkit/app";
import { z } from "@relkit/schema";

const handleEvent = defineFunction({
  id: "orders.handle",
  input: z.object({ id: z.number() }),
  output: z.object({ ok: z.boolean() }),
  handler: async (input) => ({ ok: input.id > 0 }),
});

export default handleEvent;

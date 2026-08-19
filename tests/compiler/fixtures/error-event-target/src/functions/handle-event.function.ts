import { defineFunction } from "@zsys/app";
import { z } from "@zsys/schema";

const handleEvent = defineFunction({
  id: "events.handle",
  input: z.object({ id: z.number() }),
  output: z.object({ ok: z.boolean() }),
  handler: async (input) => ({ ok: input.id > 0 }),
});

export default handleEvent;

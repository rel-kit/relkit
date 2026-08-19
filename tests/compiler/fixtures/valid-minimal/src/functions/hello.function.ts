import { defineFunction } from "@zsys/app";
import { z } from "@zsys/schema";

const hello = defineFunction({
  id: "hello",
  input: z.object({ name: z.string() }),
  output: z.object({ message: z.string() }),
  handler: async (input, context) => {
    context.log.info("hello invoked", { name: input.name });
    return { message: `Hello, ${input.name}` };
  },
});

export default hello;

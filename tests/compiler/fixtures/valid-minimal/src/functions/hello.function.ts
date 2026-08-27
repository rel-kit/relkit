import { defineFunction } from "@relkit/app";
import { z } from "@relkit/schema";

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

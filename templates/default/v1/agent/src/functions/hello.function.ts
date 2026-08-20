import { defineFunction } from "@zsys/app";
import { z } from "@zsys/schema";

const hello = defineFunction({
  id: "hello",
  input: z.object({ name: z.string().min(1).default("world") }),
  output: z.object({ message: z.string() }),
  handler: async ({ name }, _request, context) => {
    context.log.info("hello invoked", { name });
    return { message: `Hello, ${name}!` };
  },
});

export default hello;

/** Returns a validated greeting; the function the agent's tool wraps. */
import { defineFunction } from "relkit/functions";
import { z } from "zod";

const hello = defineFunction({
  id: "hello.greet",
  input: z.object({ name: z.string().min(1).default("world") }),
  output: z.object({ message: z.string() }),
  handler: async ({ name }) => ({ message: `Hello, ${name}!` }),
});

export default hello;

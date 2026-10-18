import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";

export default defineFunction({
  id: "hello.greet",
  input: z.object({
    name: z.string().min(1).max(80).refine((value) => value.trim().length > 0, "Enter a name").default("world"),
  }),
  output: z.object({ message: z.string() }),
  handler: async ({ name }) => ({ message: `Hello, ${name}!` }),
});

/** Supplies the hello service and frontend with a schema-validated greeting for the requested name. */
import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";

const hello = defineFunction({
  input: z.object({ name: z.string().min(1).default("world") }),
  output: z.object({ message: z.string() }),
  handler: async ({ name }) => ({ message: `Hello, ${name}!` }),
});

export default hello;

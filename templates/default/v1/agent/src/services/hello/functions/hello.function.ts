/** Returns a validated named greeting and logs each invocation through RELKIT's request context. */
import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";

const hello = defineFunction({
  id: "hello.greet",

  input: z.object({ name: z.string().min(1).default("world") }),
  output: z.object({ message: z.string() }),

  /**
   * Logs the greeting invocation and returns the validated greeting response.
   * @param input - Validated name from the function schema.
   * @param context - RELKIT invocation context owning structured logging.
   * @returns Greeting response matching the output schema.
   */
  handler: async ({ name }, context) => {
    context.log.info("hello invoked", { name });

    return { message: `Hello, ${name}!` };
  },
});

export default hello;

import { defineFunction } from "@zsys/app";
import { z } from "@zsys/schema";

export default defineFunction({
  input: z.object({}),
  output: z.object({ authenticated: z.boolean(), userId: z.string().optional() }),
  handler: async (_input, context) => {
    const session = await context.auth.getSession();
    return session === null
      ? { authenticated: false }
      : { authenticated: true, userId: session.user.id };
  },
});

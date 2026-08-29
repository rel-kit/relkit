import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";

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

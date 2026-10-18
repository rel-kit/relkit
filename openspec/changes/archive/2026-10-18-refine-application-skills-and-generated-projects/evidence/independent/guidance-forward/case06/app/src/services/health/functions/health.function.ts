import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";

export default defineFunction({
  id: "health.check",
  input: z.object({ verbose: z.boolean().optional() }),
  output: z.object({ status: z.literal("ok"), detail: z.string().optional() }),
  handler: async ({ verbose }) => ({
    status: "ok" as const,
    ...(verbose ? { detail: "Backend is ready" } : {}),
  }),
});

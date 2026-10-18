import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";
import { AuthenticationRequired, requireUser } from "@app/services/auth/service.js";

export default defineFunction({
  id: "users.profile",
  input: z.object({}),
  output: z.object({ id: z.string().min(1), email: z.string().min(1) }),
  errors: [AuthenticationRequired],
  handler: async (_input, context) => requireUser(context.auth),
});

import { defineFunction, fail } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";
import AuthenticationRequired from "../errors/authentication-required.error.js";
import { readCurrentUser } from "../helpers/current-user.js";

export default defineFunction({
  id: "users.current",
  input: z.object({}),
  output: z.object({ id: z.string().min(1), name: z.string(), email: z.string().email() }),
  errors: [AuthenticationRequired],
  handler: async (_input, context) => {
    const user = await readCurrentUser(context.auth);
    if (user === null) return fail(AuthenticationRequired, {});
    return user;
  },
});

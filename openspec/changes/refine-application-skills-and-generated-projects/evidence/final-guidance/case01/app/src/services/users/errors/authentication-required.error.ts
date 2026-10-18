import { defineError } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";

export default defineError({
  id: "users.authentication-required",
  data: z.object({}),
  message: "Authentication required",
  http: { status: 401 },
});

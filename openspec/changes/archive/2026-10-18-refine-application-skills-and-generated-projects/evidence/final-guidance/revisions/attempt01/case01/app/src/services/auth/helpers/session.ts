import { defineError, type AuthContext } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";

export const AuthenticationRequired = defineError({
  id: "auth.required",
  data: z.object({}),
  message: "Authentication required",
  http: { status: 401 },
});

const session = z.object({
  user: z.object({ id: z.string().min(1), name: z.string(), email: z.string().email() }),
});

export async function requireUser(auth: AuthContext) {
  const result = await session["~standard"].validate(await auth.getSession());
  if (result.issues !== undefined) throw new AuthenticationRequired({});
  return result.value.user;
}

import type { AuthContext } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";

const session = z.object({ user: z.object({ id: z.string().min(1), name: z.string(), email: z.string().email() }) });

export async function readCurrentUser(auth: AuthContext) {
  const result = await session["~standard"].validate(await auth.getSession());
  return result.issues === undefined ? result.value.user : null;
}

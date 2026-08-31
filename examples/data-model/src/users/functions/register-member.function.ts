import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";

export default defineFunction({
  input: z.object({ email: z.string().email(), organizationId: z.string().min(1) }),
  output: z.object({ userId: z.number(), membershipId: z.number() }),
  handler: async ({ email, organizationId }, context) => {
    const data = context.database.zodSchemas.users.insert.parse({ email });
    return context.database.transaction(async (tx) => {
      const user = await tx.users.insert({ data });
      const membership = await tx.memberships.insert({
        data: { organizationId, userId: user.id, role: "member" },
      });
      return { userId: user.id, membershipId: membership.id };
    });
  },
});

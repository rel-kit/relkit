import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";
import announcements from "@app/announcements/channels/announcements.channel.js";

const postAnnouncement = defineFunction({
  input: z.object({ message: z.string().min(1) }),
  output: z.object({ accepted: z.literal(true) }),
  handler: async ({ message }, context) => {
    await context.database.announcements.insert({
      data: { message, createdAt: new Date().toISOString() },
    });
    const stale = await context.database.announcements.findMany({
      orderBy: { field: "id", direction: "desc" },
      limit: 1_000,
      offset: 50,
    });
    for (const { id } of stale) {
      await context.database.announcements.delete({ where: { id } });
    }
    await announcements.trigger({}, "posted", { message, postedAt: new Date().toISOString() });
    return { accepted: true as const };
  },
});

export default postAnnouncement;

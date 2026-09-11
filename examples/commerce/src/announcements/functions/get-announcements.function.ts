import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";

const getAnnouncements = defineFunction({
  input: z.object({}),
  output: z.object({ messages: z.array(z.string()) }),
  handler: async (_, context) => ({
    messages: (
      await context.database.announcements.findMany({
        orderBy: { field: "id", direction: "desc" },
        limit: 50,
      })
    )
      .reverse()
      .map(({ message }) => message),
  }),
});

export default getAnnouncements;

import { defineChannel } from "@relkit/app/realtime";
import { z } from "@relkit/app/schema";

const announcements = defineChannel({
  id: "announcements.feed",
  params: z.object({}),
  events: { posted: z.object({ message: z.string(), postedAt: z.string() }) },
  client: { public: true },
  replay: { retentionMs: 300_000, maxEvents: 1_000 },
});

export default announcements;

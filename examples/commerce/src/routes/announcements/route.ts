import { defineRoute } from "@relkit/app/routes";
import announcements from "@app/announcements/service.js";

export const GET = defineRoute({
  target: announcements.getAnnouncements,
  client: { operation: "query" },
});

export const POST = defineRoute({
  target: announcements.postAnnouncement,
  client: { operation: "mutation" },
});

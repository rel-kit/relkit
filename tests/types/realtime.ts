import { defineChannel } from "@relkit/realtime";
import { z } from "@relkit/schema";

const eventsOnly = defineChannel({
  id: "types.events-only",
  params: z.object({ id: z.string() }),
  events: { changed: z.object({ value: z.number() }) },
  client: { public: true },
});

// @ts-expect-error getPresence is absent without a presence declaration
eventsOnly.getPresence;
// @ts-expect-error event payload is inferred
eventsOnly.trigger({ id: "one" }, "changed", { value: "wrong" });

const count = defineChannel({
  id: "types.count-presence",
  params: z.object({ id: z.string() }),
  events: {},
  client: { public: true },
  presence: "count",
});
const countPresence = await count.getPresence({ id: "one" });
// @ts-expect-error count presence has no member list
countPresence.members;

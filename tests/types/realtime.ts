import { defineFunction } from "relkit/functions";
import { defineChannel } from "relkit/realtime";
import { z } from "relkit/schema";

const eventsOnly = defineChannel({
  id: "types.events-only",
  params: z.object({ id: z.string() }),
  events: { changed: z.object({ value: z.number() }) },
  client: { public: true },
});

const count = defineChannel({
  id: "types.count-presence",
  params: z.object({ id: z.string() }),
  events: {},
  client: { public: true },
  presence: "count",
});

defineFunction({
  id: "types.channel-caller",
  input: z.object({}),
  output: z.number(),
  dependencies: { channels: { eventsOnly, count } },
  handler: async (_input, context) => {
    // @ts-expect-error getPresence is absent without a presence declaration
    context.channels.eventsOnly.getPresence;
    // @ts-expect-error event payload is inferred
    await context.channels.eventsOnly.trigger({ id: "one" }, "changed", { value: "wrong" });
    const countPresence = await context.channels.count.getPresence({ id: "one" });
    // @ts-expect-error count presence has no member list
    countPresence.members;
    return countPresence.connections ?? 0;
  },
});

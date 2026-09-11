import { feature } from "./documentation-catalog.js";

export const realtimeFeature = feature(
  "realtime",
  "Realtime channels",
  "Append typed events and observe authorized partitions with replay and presence.",
  "realtime/index",
  "realtime",
  [["packages/realtime/src/channel.ts", "defineChannel"]],
  ["examples/commerce/src/announcements/channels/announcements.channel.ts"],
);

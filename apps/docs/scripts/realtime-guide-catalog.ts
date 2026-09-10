import type { ApiPackage } from "./documentation-catalog.js";

export const realtimeGuideGroup = {
  directory: "realtime",
  title: "Realtime",
  icon: "Radio",
  pages: ["index", "access", "react", "presence", "recovery", "providers"],
} as const;

const api = ["realtime", "client"] satisfies readonly ApiPackage[];

export const realtimeGuideRelations = [
  relation("index", "examples/commerce/src/announcements/channels/announcements.channel.ts"),
  relation("access", "examples/commerce/src/orders/channels/order-updates.channel.ts"),
  relation("react", "examples/commerce-web/app/page.tsx"),
  relation("presence", "examples/commerce/src/orders/channels/order-updates.channel.ts"),
  relation("recovery", "examples/commerce/src/orders/channels/order-updates.channel.ts"),
  relation("providers", "examples/commerce/relkit.config.ts"),
];

function relation(page: (typeof realtimeGuideGroup.pages)[number], example: string) {
  return { path: `realtime/${page}`, api, examples: [example] };
}

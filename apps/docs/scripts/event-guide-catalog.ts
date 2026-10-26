import type { ApiPackage } from "./documentation-catalog.js";

export const eventGuideGroup = {
  directory: "docs/modules/events",
  title: "Events",
  icon: "Radio",
  pages: ["index", "define", "publish", "consume"],
} as const;

export const eventGuideRelations = [
  {
    path: "docs/modules/events/index",
    api: ["events", "functions"],
    examples: ["apps/docs/examples/events/order-created.event.ts"],
  },
  {
    path: "docs/modules/events/define",
    api: ["events"],
    examples: ["apps/docs/examples/events/order-created.event.ts"],
  },
  {
    path: "docs/modules/events/publish",
    api: ["events", "functions"],
    examples: ["apps/docs/examples/events/create-order.function.ts"],
  },
  {
    path: "docs/modules/events/consume",
    api: ["events"],
    examples: ["apps/docs/examples/events/order-confirmation.function.ts"],
  },
  {
    path: "guides/events/react-to-order-events",
    api: ["events", "functions"],
    examples: ["apps/docs/examples/events/create-order.function.ts"],
  },
] satisfies readonly {
  path: string;
  api: readonly ApiPackage[];
  examples: readonly string[];
}[];

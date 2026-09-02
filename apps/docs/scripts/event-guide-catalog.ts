import type { ApiPackage } from "./documentation-catalog.js";

export const eventGuideGroup = {
  directory: "events",
  title: "Events",
  icon: "Radio",
  pages: ["index", "define", "publish", "consume", "first-event"],
} as const;

export const eventGuideRelations = [
  {
    path: "events/index",
    api: ["events", "functions"],
    examples: ["apps/docs/examples/events/order-created.event.ts"],
  },
  {
    path: "events/define",
    api: ["events"],
    examples: ["apps/docs/examples/events/order-created.event.ts"],
  },
  {
    path: "events/publish",
    api: ["events", "functions"],
    examples: ["apps/docs/examples/events/create-order.function.ts"],
  },
  {
    path: "events/consume",
    api: ["events"],
    examples: ["apps/docs/examples/events/order-confirmation.function.ts"],
  },
  {
    path: "events/first-event",
    api: ["events", "functions"],
    examples: ["apps/docs/examples/events/create-order.function.ts"],
  },
] satisfies readonly {
  path: string;
  api: readonly ApiPackage[];
  examples: readonly string[];
}[];

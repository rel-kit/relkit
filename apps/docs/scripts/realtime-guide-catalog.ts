/** Defines realtime guide ordering and source-backed channel/client relations without opening realtime connections. */
import type { ApiPackage } from "./documentation-catalog.js";

export const realtimeGuideGroup = {
  directory: "realtime",
  title: "Realtime",
  icon: "Radio",
  pages: ["index", "access", "react", "presence", "recovery", "providers"],
} as const;

const api = ["realtime", "client"] satisfies readonly ApiPackage[];

export const realtimeGuideRelations = [
  relation(
    "index",
    "examples/commerce/src/services/announcements/channels/announcements.channel.ts",
  ),
  relation("access", "examples/commerce/src/services/orders/channels/order-updates.channel.ts"),
  relation("react", "examples/commerce-web/app/page.tsx"),
  relation("presence", "examples/commerce/src/services/orders/channels/order-updates.channel.ts"),
  relation("recovery", "examples/commerce/src/services/orders/channels/order-updates.channel.ts"),
  relation("providers", "examples/commerce/relkit.config.ts"),
];

/** Projects one supported realtime guide into its source-backed catalog relation.
 * @param page - Declared realtime guide filename.
 * @param example - Authoritative repository example path.
 * @returns Pure guide/API/example relation consumed by the documentation generator.
 */
function relation(page: (typeof realtimeGuideGroup.pages)[number], example: string) {
  return { path: `realtime/${page}`, api, examples: [example] };
}

import type { ApiPackage } from "./documentation-catalog.js";

export const clientGuideGroup = {
  directory: "client",
  title: "Typed Client",
  icon: "PanelsTopLeft",
  pages: ["index", "routes", "mutations", "streams", "ssr", "authentication", "offline"],
} as const;

export const clientGuideRelations = clientGuideGroup.pages.map((page) => ({
  path: `client/${page}`,
  api: ["client", "routes"] satisfies readonly ApiPackage[],
  examples: ["tests/types/client-react.ts"],
}));

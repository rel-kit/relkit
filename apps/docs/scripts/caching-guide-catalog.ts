/** Defines caching navigation and grouped cache/function source relations as pure documentation catalog data. */
import type { ApiPackage } from "./documentation-catalog.js";

export const cachingGuideGroup = {
  directory: "caching",
  title: "Caching",
  icon: "Zap",
  pages: ["index", "define", "read-write", "expiration", "first-cache"],
} as const;

export const cachingGuideRelations = cachingGuideGroup.pages.map((page) => ({
  path: `caching/${page}`,
  api: ["cache", "functions"] satisfies readonly ApiPackage[],
  examples: [
    "examples/commerce/src/services/orders/cache/prices.cache.ts",
    "examples/commerce/tests/fixtures/get-price.function.ts",
  ],
}));

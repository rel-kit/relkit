/** Defines storage navigation and grouped bucket/function source relations as pure documentation catalog data. */
import type { ApiPackage } from "./documentation-catalog.js";
import { relation } from "./guide-catalog-helpers.js";

export const storageGuideGroup = {
  directory: "docs/modules/storage",
  title: "Storage",
  icon: "HardDrive",
  pages: ["index", "define", "local-storage", "upload", "read-delete"],
} as const;

export const storageGuideRelations = storageGuideGroup.pages.map((page) => ({
  path: `docs/modules/storage/${page}`,
  api: ["buckets", "functions"] satisfies readonly ApiPackage[],
  examples: [
    "examples/commerce/src/services/assets/buckets/assets.bucket.ts",
    "examples/commerce/src/services/assets/functions/upload-assets.function.ts",
  ],
}));

export const uploadGuideRelation = relation(
  "guides/storage/upload-product-images",
  [
    "buckets",
    "functions",
    "app",
    "config",
    "schema",
    "routes",
    "services",
    "integrations/s3",
    "integrations/docker",
  ],
  ["examples/commerce/src/services/assets/functions/upload-assets.function.ts"],
);

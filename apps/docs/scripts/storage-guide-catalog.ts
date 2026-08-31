import type { ApiPackage } from "./documentation-catalog.js";

export const storageGuideGroup = {
  directory: "storage",
  title: "Storage",
  icon: "HardDrive",
  pages: ["index", "define", "upload", "read-delete", "first-upload"],
} as const;

export const storageGuideRelations = storageGuideGroup.pages.map((page) => ({
  path: `storage/${page}`,
  api: ["buckets", "functions"] satisfies readonly ApiPackage[],
  examples: [
    "examples/commerce/src/assets/buckets/assets.bucket.ts",
    "examples/commerce/src/assets/functions/upload-assets.function.ts",
  ],
}));

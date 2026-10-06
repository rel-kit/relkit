import type { dependencyFields } from "./catalog-manifest.js";

export type { CatalogManifest } from "create-relkit/catalog-resolution";

/** Concrete declarations for all package dependency fields. */
export type DependencyFields = Record<(typeof dependencyFields)[number], Record<string, string>>;

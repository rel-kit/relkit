/** Defines the root Docs pages about the project itself and their source relations as pure catalog data. */
import { relation } from "./guide-catalog-helpers.js";

/** Root pages for maturity, versioning, benchmarks and metrics, in sidebar order. */
export const projectPages = [
  "docs/maturity",
  "docs/versioning",
  "docs/benchmarks",
  "docs/metrics",
] as const;

/** Reference and source relations of those pages. */
export const projectPageRelations = [
  relation("docs/maturity", ["app"], []),
  relation("docs/versioning", ["app"], []),
  relation("docs/benchmarks", ["app"], ["scripts/benchmark-dev-loop.ts"]),
  relation("docs/metrics", ["app"], ["scripts/metrics.ts"]),
];

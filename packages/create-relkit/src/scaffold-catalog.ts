/** Declares portable feature dependency metadata and selected SDK owners used by creation and add manifest producers. */

import { buildCatalogDependency, buildCatalogProvider } from "./build-catalog.js";
import type { ScaffoldDependency, ScaffoldDependencyName } from "./scaffold-catalog.types.js";
export type {
  DependencySection,
  ScaffoldDependency,
  ScaffoldDependencyName,
} from "./scaffold-catalog.types.js";

/** Versions copied into generated projects from each package's own release metadata. */
export const SCAFFOLD_DEPENDENCIES = Object.freeze({
  "@cloudflare/workers-types": {
    version: buildCatalogDependency("@cloudflare/workers-types"),
    section: "devDependencies",
  },
  "@relkit/aws": { version: buildCatalogProvider("@relkit/aws"), section: "dependencies" },
  "@relkit/better-auth": {
    version: buildCatalogProvider("@relkit/better-auth"),
    section: "dependencies",
  },
  "@relkit/cloudflare": {
    version: buildCatalogProvider("@relkit/cloudflare"),
    section: "dependencies",
  },
  "@relkit/docker": { version: buildCatalogProvider("@relkit/docker"), section: "dependencies" },
  "@relkit/effect-mq": {
    version: buildCatalogProvider("@relkit/effect-mq"),
    section: "dependencies",
  },
  "@relkit/inngest": { version: buildCatalogProvider("@relkit/inngest"), section: "dependencies" },
  "@relkit/drizzle": { version: buildCatalogProvider("@relkit/drizzle"), section: "dependencies" },
  "@relkit/local": { version: buildCatalogProvider("@relkit/local"), section: "dependencies" },
  "@relkit/langchain": {
    version: buildCatalogProvider("@relkit/langchain"),
    section: "dependencies",
  },
  "@relkit/pulumi": { version: buildCatalogProvider("@relkit/pulumi"), section: "dependencies" },
  "@relkit/redis": { version: buildCatalogProvider("@relkit/redis"), section: "dependencies" },
  "@relkit/s3": { version: buildCatalogProvider("@relkit/s3"), section: "dependencies" },
  "@relkit/trigger": { version: buildCatalogProvider("@relkit/trigger"), section: "dependencies" },
  "better-auth": { version: buildCatalogDependency("better-auth"), section: "dependencies" },
  "drizzle-kit": { version: buildCatalogDependency("drizzle-kit"), section: "devDependencies" },
  "drizzle-orm": { version: buildCatalogDependency("drizzle-orm"), section: "dependencies" },
  langchain: { version: buildCatalogDependency("langchain"), section: "dependencies" },
  "@langchain/core": {
    version: buildCatalogDependency("@langchain/core"),
    section: "dependencies",
  },
  "@langchain/langgraph": {
    version: buildCatalogDependency("@langchain/langgraph"),
    section: "dependencies",
  },
  langsmith: { version: buildCatalogDependency("langsmith"), section: "dependencies" },
} satisfies Readonly<Record<string, ScaffoldDependency>>);

/**
 * Selects one supported dependency from the release's portable scaffold catalog.
 * @param name - Intentional dependency name supported by the scaffold planner.
 * @returns Its concrete version and manifest section.
 */
export function scaffoldDependency(name: ScaffoldDependencyName): ScaffoldDependency {
  return SCAFFOLD_DEPENDENCIES[name];
}

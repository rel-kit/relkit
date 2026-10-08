import manifest from "../package.json";
import { buildCatalogDependency } from "./build-catalog.js";
import type { ScaffoldDependency, ScaffoldDependencyName } from "./scaffold-catalog.types.js";
export type {
  DependencySection,
  ScaffoldDependency,
  ScaffoldDependencyName,
} from "./scaffold-catalog.types.js";

/** Versions copied into generated projects; first-party packages share this fixed release train. */
export const SCAFFOLD_DEPENDENCIES = Object.freeze({
  "@relkit/aws": { version: manifest.version, section: "dependencies" },
  "@relkit/better-auth": { version: manifest.version, section: "dependencies" },
  "@relkit/cloudflare": { version: manifest.version, section: "dependencies" },
  "@relkit/docker": { version: manifest.version, section: "dependencies" },
  "@relkit/effect-mq": { version: manifest.version, section: "dependencies" },
  "@relkit/inngest": { version: manifest.version, section: "dependencies" },
  "@relkit/drizzle": { version: manifest.version, section: "dependencies" },
  "@relkit/local": { version: manifest.version, section: "dependencies" },
  "@relkit/pulumi": { version: manifest.version, section: "dependencies" },
  "@relkit/redis": { version: manifest.version, section: "dependencies" },
  "@relkit/s3": { version: manifest.version, section: "dependencies" },
  "@relkit/trigger": { version: manifest.version, section: "dependencies" },
  "better-auth": { version: buildCatalogDependency("better-auth"), section: "dependencies" },
  "drizzle-kit": { version: buildCatalogDependency("drizzle-kit"), section: "devDependencies" },
  "drizzle-orm": { version: buildCatalogDependency("drizzle-orm"), section: "dependencies" },
  langchain: { version: buildCatalogDependency("langchain"), section: "dependencies" },
} satisfies Readonly<Record<string, ScaffoldDependency>>);

/**
 * Selects one supported dependency from the release's portable scaffold catalog.
 * @param name - Intentional dependency name supported by the scaffold planner.
 * @returns Its concrete version and manifest section.
 */
export function scaffoldDependency(name: ScaffoldDependencyName): ScaffoldDependency {
  return SCAFFOLD_DEPENDENCIES[name];
}

import type { SCAFFOLD_DEPENDENCIES } from "./scaffold-catalog.js";

/** Manifest section in which a scaffold introduces a supported dependency. */
export type DependencySection = "dependencies" | "devDependencies";

/** Concrete release-supported version and owning project manifest section. */
export interface ScaffoldDependency {
  readonly version: string;
  readonly section: DependencySection;
}

/** Intentional scaffold dependency names, retaining their literal keyed catalog contract. */
export type ScaffoldDependencyName = keyof typeof SCAFFOLD_DEPENDENCIES;

/**
 * Defines recipe selections and decoded metadata consumed by the docs producer.
 * Recipes choose capabilities and public leaves; owner manifests supply versions
 * and SDK phases. The resolved declarations also feed isolated consumer checks.
 */
import type { IntegrationDependencyPhase } from "@relkit/contracts";
import type { ScaffoldDependencyName } from "create-relkit/internal/scaffold-catalog.types";
import type { Schema } from "effect";
import type * as Schemas from "./installation-catalog.schemas.js";

/** Package fields decoded at the documentation build boundary. */
export interface InstallationManifest extends Schema.Schema.Type<
  typeof Schemas.InstallationManifest
> {}

/** Root default and named Bun catalogs used to resolve selected peers. */
export interface InstallationWorkspace extends Schema.Schema.Type<
  typeof Schemas.InstallationWorkspace
> {}

/** A package's selected capability/leaf requirements for one reader workflow. */
export interface InstallationSelection {
  readonly name: string;
  readonly capabilities?: readonly string[];
  readonly phases?: readonly IntegrationDependencyPhase[];
  readonly peers?: readonly string[];
  readonly section?: "dependencies" | "devDependencies";
  /** False when a consumer selects only SDK metadata from this owner. */
  readonly includeOwner?: boolean;
}

/** A bounded install workflow; no package version literals belong here. */
export interface InstallationRecipe {
  readonly title: string;
  readonly selections: readonly InstallationSelection[];
  readonly tools?: readonly ScaffoldDependencyName[];
  readonly drizzlePatch?: boolean;
  readonly betterFetch?: boolean;
  readonly global?: boolean;
}

/** Metadata snapshot loaded once per generation, independent of SDK evaluation. */
export interface InstallationCatalog {
  readonly packages: ReadonlyMap<string, InstallationManifest>;
  readonly workspace: InstallationWorkspace;
}

/** Manifest sections selected by a recipe; patches/overrides are rendered separately. */
export interface InstallationDeclarations {
  readonly dependencies: Readonly<Record<string, string>>;
  readonly devDependencies: Readonly<Record<string, string>>;
}

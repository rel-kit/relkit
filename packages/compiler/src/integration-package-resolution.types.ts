/** Project root and authoring imports whose package metadata must be resolved. */
export interface ResolveRuntimeIntegrationPackagesOptions {
  readonly projectRoot: string;
  readonly imports: readonly string[];
}

/** Canonical package root and untrusted parsed package manifest. */
export interface LoadedPackage {
  readonly root: string;
  readonly manifest: Record<string, unknown>;
}

/** Declared package role used by compile-time tooling integrations. */
export type IntegrationPackageRole =
  | "localRecipe"
  | "localMaterializer"
  | "localService"
  | "engine"
  | "host"
  | "infrastructure"
  | "access";

/** Package owner and selected role whose export must remain inside the canonical package root. */
export interface ResolveIntegrationPackageRoleOptions {
  readonly projectRoot: string;
  readonly packageName: string;
  readonly integrationId: string;
  readonly role: IntegrationPackageRole;
}

/** Validated tooling export and its canonical contained module path. */
export interface ResolvedIntegrationPackageRole {
  readonly packageName: string;
  readonly packageVersion: string;
  readonly integrationId: string;
  readonly exportName: string;
  readonly resolvedPath: string;
}

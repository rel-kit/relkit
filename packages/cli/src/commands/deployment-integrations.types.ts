import type { DeploymentIntegrationMetadata } from "@relkit/deploy";
import type { ModuleNamespace } from "../services/modules.types.js";

/** Accepted package resolution and original native module namespace. */
export interface LoadedDeploymentIntegration {
  readonly metadata: DeploymentIntegrationMetadata;
  readonly packageName: string;
  readonly packageVersion: string;
  readonly exportName: string;
  readonly resolvedPath: string;
  readonly module: ModuleNamespace;
}
/** Selected deployment cohort's complete role authority. */
export interface LoadedDeploymentIntegrations {
  readonly engine: LoadedDeploymentIntegration;
  readonly host: LoadedDeploymentIntegration;
  readonly infrastructure: ReadonlyMap<string, LoadedDeploymentIntegration>;
  readonly access: ReadonlyMap<string, LoadedDeploymentIntegration>;
}

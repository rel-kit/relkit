/** Describes the narrow native configuration projections checked by documentation tests. */
export interface DocumentationManifest {
  readonly scripts: Readonly<Record<string, string>>;
}
export interface DeploymentConfiguration {
  readonly build: { readonly builder: string; readonly dockerfilePath: string };
  readonly deploy: { readonly startCommand: string; readonly healthcheckPath: string };
}
export interface DocumentationCoverage {
  readonly features: readonly { readonly id: string }[];
  readonly guides: readonly { readonly path: string }[];
}

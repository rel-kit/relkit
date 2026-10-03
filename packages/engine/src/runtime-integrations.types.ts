/** Explicitly loaded runtime export and package identity from the integration plan. */
export interface LoadedRuntimeIntegrationModule {
  readonly packageName: string;
  readonly packageVersion: string;
  readonly exportName: string;
  readonly module: unknown;
}

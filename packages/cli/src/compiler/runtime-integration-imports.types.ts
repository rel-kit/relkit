/** Runtime integration export binding selected for static module generation. */
export interface RuntimeModuleImport {
  readonly packageName: string;
  readonly packageVersion: string;
  readonly exportName: string;
}

/** How the runtime integration module is rendered. */
export interface RuntimeIntegrationImportOptions {
  /**
   * Renders static imports with no startup dependency check, for a Workers bundle: it has no files
   * to check and its modules may not await at the top level.
   */
  readonly workers?: boolean;
}

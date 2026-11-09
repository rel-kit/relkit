/** Project root and generated declaration directory used for context type imports. */
export interface ContextRegistryGenerationOptions {
  readonly projectRoot: string;
  readonly generatedDirectory?: string;
  /** Resolved descriptor IDs keyed by `<module>\0<export name>`, for IDs the compiler infers. */
  readonly identities?: ReadonlyMap<string, string>;
}

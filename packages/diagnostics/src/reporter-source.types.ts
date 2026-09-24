/** Replaceable source provider for rendered excerpts.
 * Providers receive normalized paths and should avoid mutable shared state.
 * @example const source: DiagnosticSourceService = { read: () => undefined };
 */
export interface DiagnosticSourceService {
  /** Reads text for a normalized path.
   * @param file - Portable file path.
   * @returns Source text when available.
   * @throws The provider's own error, mapped to DiagnosticSourceError in Effect formatting.
   * @example source.read("src/routes.ts");
   */
  readonly read: (file: string) => string | undefined;
}

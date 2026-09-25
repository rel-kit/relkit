export type { ProviderFailure } from "./failure.types.js";

/** Missing managed dependency identity supplied by the caller.
 * These fields identify which configured category and name were requested.
 * @example const missing: DependencyNotConfiguredCause = { category: "cache", dependencyName: "primary" };
 */
export interface DependencyNotConfiguredCause {
  readonly category: string;
  readonly dependencyName: string;
}

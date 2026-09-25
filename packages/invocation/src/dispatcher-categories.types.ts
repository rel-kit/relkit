import type { MANAGED_DEPENDENCY_CATEGORIES } from "./dispatcher-categories.js";

/** Category of a managed dependency map available to a handler.
 * @example const category: ManagedDependencyCategory = "cache";
 */
export type ManagedDependencyCategory = (typeof MANAGED_DEPENDENCY_CATEGORIES)[number];

/** Optional standalone client maps keyed by managed dependency category.
 * An absent category is rejected when a handler tries to access it.
 * @example const clients: ManagedDependencySources = { cache: { primary: cacheClient } };
 */
export type ManagedDependencySources = Partial<{
  readonly [Category in ManagedDependencyCategory]: Readonly<Record<string, unknown>>;
}>;

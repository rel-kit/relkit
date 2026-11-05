/** Contract of the development module reloader shared by the warm evaluator and the dev server. */

/** Loaded-module tracking and eviction for one project root. */
export interface ModuleReloader {
  /** Records the modification stamp of every loaded application module. */
  readonly record: () => void;
  /** @returns Every application module currently in the registry, sorted. */
  readonly loaded: () => readonly string[];
  /** @returns Loaded application modules whose file changed or disappeared since `record`. */
  readonly changed: () => readonly string[];
  /**
   * Evicts files and every loaded module that transitively imports them.
   * @param files - Absolute or project-relative changed files.
   * @returns Every evicted absolute file, sorted.
   */
  readonly invalidate: (files: readonly string[]) => readonly string[];
}

/** Contract of the development module reloader shared by the warm evaluator and the dev server. */

/** Loaded-module tracking and eviction for one project root. */
export interface ModuleReloader {
  /**
   * Records the modification stamp of every loaded application module.
   * @param before - Stamps taken with {@link ModuleReloader.stamps} before the modules were
   * imported; a file changed while they loaded keeps its earlier stamp, so the next `changed`
   * reports it instead of the loaded module silently standing for the newer file.
   */
  readonly record: (before?: ReadonlyMap<string, string>) => void;
  /** @returns The current modification stamp of every loaded application module. */
  readonly stamps: () => ReadonlyMap<string, string>;
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

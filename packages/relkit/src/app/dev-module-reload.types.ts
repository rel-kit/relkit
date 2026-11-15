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
   * Drops, by path, every file evicted since it last loaded, and the new files it imports,
   * whether loaded or not. Call it after an import fails: a module that failed to parse stays in
   * the runtime's loader without appearing in the registry keys, and a later import of it, or of
   * a module importing it, never settles; one that threw at the top level stays half-initialized.
   * `invalidate` first drops the ones that are not loaded, which covers the next reload.
   * @returns The dropped absolute files, sorted.
   */
  readonly discardFailed: () => readonly string[];
  /**
   * Evicts files and every loaded module that transitively imports them.
   * @param files - Absolute or project-relative changed files.
   * @returns Every evicted absolute file, sorted.
   */
  readonly invalidate: (files: readonly string[]) => readonly string[];
}

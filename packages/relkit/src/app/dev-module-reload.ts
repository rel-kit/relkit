/**
 * Tracks the application modules a development process has loaded and evicts the changed
 * ones, together with every loaded module that imports them, from Bun's module registry.
 * The warm evaluator and the development server both use it: after eviction the next
 * import evaluates a fresh module record for each evicted file while every other module
 * keeps its cached instance. Bun keys ES modules by path, and a fresh query string alone
 * would still bind static imports to the old dependency, so eviction is what makes a
 * re-import observe the edit. Only files below the project root and outside
 * `node_modules` and `.relkit` are tracked. Development-only and Bun-specific.
 */
import { readFileSync, statSync } from "node:fs";
import { dirname, extname, resolve, sep } from "node:path";
import type { ModuleReloader } from "./dev-module-reload.types.js";
export type { ModuleReloader } from "./dev-module-reload.types.js";

/** Loaders for the source extensions whose imports are scanned. */
const LOADERS: Readonly<Record<string, "ts" | "tsx" | "js" | "jsx">> = {
  ".ts": "ts",
  ".mts": "ts",
  ".cts": "ts",
  ".tsx": "tsx",
  ".js": "js",
  ".mjs": "js",
  ".cjs": "js",
  ".jsx": "jsx",
};

/**
 * Creates a reloader for one project root.
 * @param projectRoot - Absolute application root.
 * @returns Recording, change detection and eviction over the loaded application modules.
 */
export function createModuleReloader(projectRoot: string): ModuleReloader {
  const root = resolve(projectRoot);
  const recorded = new Map<string, string>();
  const scans = new Map<string, { readonly stamp: string; readonly imports: readonly string[] }>();
  const loaded = () => loadedProjectModules(root);
  return {
    record: () => {
      recorded.clear();
      for (const file of loaded()) recorded.set(file, stampOf(file));
    },
    changed: () =>
      loaded().filter((file) => (recorded.get(file) ?? stampOf(file)) !== stampOf(file)),
    loaded,
    invalidate: (files) => {
      const affected = importersOf(
        new Set(files.map((file) => resolve(root, file))),
        loaded(),
        scans,
      );
      if (affected.size > 0) advanceEvaluationEpoch();
      evict(affected);
      return [...affected].sort();
    },
  };
}

/**
 * Lists application modules currently in Bun's registry.
 * @param root - Absolute project root.
 * @returns Absolute file paths, without query strings, sorted.
 */
function loadedProjectModules(root: string): string[] {
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
  const files = new Set<string>();
  for (const key of Object.keys(require.cache)) {
    const file = key.split("?", 1)[0] ?? key;
    if (!file.startsWith(prefix)) continue;
    const local = file.slice(prefix.length);
    if (local.includes(`node_modules${sep}`) || local.startsWith(`.relkit${sep}`)) continue;
    files.add(file);
  }
  return [...files].sort();
}

/**
 * Adds every loaded module that transitively imports one of the given files.
 * @param changed - Absolute changed files.
 * @param loaded - Loaded application modules.
 * @param scans - Import scans cached by file stamp.
 * @returns The changed files and all of their loaded importers.
 */
function importersOf(
  changed: ReadonlySet<string>,
  loaded: readonly string[],
  scans: Map<string, { readonly stamp: string; readonly imports: readonly string[] }>,
): Set<string> {
  const importers = new Map<string, string[]>();
  for (const file of loaded)
    for (const dependency of importsOf(file, scans))
      importers.set(dependency, [...(importers.get(dependency) ?? []), file]);
  const affected = new Set(changed);
  const pending = [...changed];
  while (pending.length > 0) {
    const file = pending.pop();
    if (file === undefined) break;
    for (const importer of importers.get(file) ?? [])
      if (!affected.has(importer)) {
        affected.add(importer);
        pending.push(importer);
      }
  }
  return affected;
}

/**
 * Resolves the static and dynamic imports of one module.
 * @param file - Absolute module path.
 * @param scans - Cache keyed by file stamp, so unchanged files are scanned once.
 * @returns Absolute resolved dependency paths; unresolvable specifiers are skipped.
 */
function importsOf(
  file: string,
  scans: Map<string, { readonly stamp: string; readonly imports: readonly string[] }>,
): readonly string[] {
  const loader = LOADERS[extname(file)];
  const stamp = stampOf(file);
  const cached = scans.get(file);
  if (cached?.stamp === stamp) return cached.imports;
  let imports: string[] = [];
  if (loader !== undefined && stamp !== "missing") {
    imports = scan(readFileSync(file, "utf8"), loader).flatMap((entry) => {
      try {
        return [Bun.resolveSync(entry.path, dirname(file)).split("?", 1)[0] ?? entry.path];
      } catch {
        return [];
      }
    });
  }
  scans.set(file, { stamp, imports });
  return imports;
}

/**
 * Starts a new evaluation pass: services evaluated from now on may claim functions that a
 * service of an earlier pass owned (see `bindDescriptorServiceMembers`).
 */
function advanceEvaluationEpoch(): void {
  const key = Symbol.for("relkit.dev.evaluationEpoch");
  const store = globalThis as { [key: symbol]: number | undefined };
  store[key] = (store[key] ?? 0) + 1;
}

/**
 * Lists a module's import specifiers.
 * @param source - Module source.
 * @param loader - Transpiler loader for its extension.
 * @returns Specifiers; none for a file that does not parse, whose evaluation reports the error.
 */
function scan(
  source: string,
  loader: "ts" | "tsx" | "js" | "jsx",
): readonly { readonly path: string }[] {
  try {
    return new Bun.Transpiler({ loader }).scanImports(source);
  } catch {
    return [];
  }
}

/**
 * Deletes every registry entry of the given files, including query-string variants.
 * @param files - Absolute file paths.
 */
function evict(files: ReadonlySet<string>): void {
  for (const key of Object.keys(require.cache))
    if (files.has(key.split("?", 1)[0] ?? key)) delete require.cache[key];
}

/**
 * Reads a file's modification stamp.
 * @param file - Absolute path.
 * @returns Modification time and size, or `missing` for a deleted file.
 */
function stampOf(file: string): string {
  try {
    const stats = statSync(file);
    return `${stats.mtimeMs}:${stats.size}`;
  } catch {
    return "missing";
  }
}

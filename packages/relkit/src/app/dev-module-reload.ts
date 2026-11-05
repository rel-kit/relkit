/**
 * Tracks the application modules a development process has loaded and evicts the changed
 * ones, together with every loaded module that imports them, from the runtime's module registry.
 * The warm evaluator and the development server both use it: after eviction the next
 * import evaluates a fresh module record for each evicted file while every other module
 * keeps its cached instance. Bun keys ES modules by path, and a fresh query string alone
 * would still bind static imports to the old dependency, so eviction is what makes a
 * re-import observe the edit. Only files below the project root and outside
 * `node_modules` and `.relkit` are tracked. Development-only; the registry comes from the runtime
 * adapter, and runtimes without one (Node) restart the process instead.
 */
import { readFileSync, statSync } from "node:fs";
import { dirname, extname, resolve, sep } from "node:path";
import type {
  RuntimeModuleRegistry,
  RuntimeModules,
  RuntimeSourceLoader,
} from "../runtime/runtime-processes.types.js";
import type { ModuleReloader } from "./dev-module-reload.types.js";
export type { ModuleReloader } from "./dev-module-reload.types.js";

/** Loaders for the source extensions whose imports are scanned. */
const LOADERS: Readonly<Record<string, RuntimeSourceLoader>> = {
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
 * @param modules - The runtime adapter's modules; its registry must be defined.
 * @returns Recording, change detection and eviction over the loaded application modules.
 */
export function createModuleReloader(projectRoot: string, modules: RuntimeModules): ModuleReloader {
  const registry = modules.registry;
  if (registry === undefined)
    throw new Error("This runtime cannot evict modules; restart the process to reload.");
  const root = resolve(projectRoot);
  const recorded = new Map<string, string>();
  const scans = new Map<string, { readonly stamp: string; readonly imports: readonly string[] }>();
  const loaded = () => loadedProjectModules(root, registry);
  const lookup: ImportLookup = { registry, resolve: modules.resolve, scans };
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
        lookup,
      );
      if (affected.size > 0) advanceEvaluationEpoch();
      evict(affected, registry);
      return [...affected].sort();
    },
  };
}

/** Registry, resolution and the import scans cached by file stamp. */
interface ImportLookup {
  readonly registry: RuntimeModuleRegistry;
  readonly resolve: RuntimeModules["resolve"];
  readonly scans: Map<string, { readonly stamp: string; readonly imports: readonly string[] }>;
}

/**
 * Lists application modules currently in the registry.
 * @param root - Absolute project root.
 * @param registry - Runtime module registry.
 * @returns Absolute file paths, without query strings, sorted.
 */
function loadedProjectModules(root: string, registry: RuntimeModuleRegistry): string[] {
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
  const files = new Set<string>();
  for (const key of registry.keys()) {
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
 * @param lookup - Registry, resolution and cached scans.
 * @returns The changed files and all of their loaded importers.
 */
function importersOf(
  changed: ReadonlySet<string>,
  loaded: readonly string[],
  lookup: ImportLookup,
): Set<string> {
  const importers = new Map<string, string[]>();
  for (const file of loaded)
    for (const dependency of importsOf(file, lookup))
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
 * @param lookup - Registry, resolution and the scan cache keyed by file stamp, so unchanged files
 * are scanned once.
 * @returns Absolute resolved dependency paths; unresolvable specifiers are skipped.
 */
function importsOf(file: string, lookup: ImportLookup): readonly string[] {
  const loader = LOADERS[extname(file)];
  const stamp = stampOf(file);
  const cached = lookup.scans.get(file);
  if (cached?.stamp === stamp) return cached.imports;
  let imports: string[] = [];
  if (loader !== undefined && stamp !== "missing") {
    imports = scan(readFileSync(file, "utf8"), loader, lookup.registry).flatMap((specifier) => {
      try {
        return [lookup.resolve(specifier, dirname(file))];
      } catch {
        return [];
      }
    });
  }
  lookup.scans.set(file, { stamp, imports });
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
 * @param registry - Runtime registry that scans imports.
 * @returns Specifiers; none for a file that does not parse, whose evaluation reports the error.
 */
function scan(
  source: string,
  loader: RuntimeSourceLoader,
  registry: RuntimeModuleRegistry,
): readonly string[] {
  try {
    return registry.scanImports(source, loader);
  } catch {
    return [];
  }
}

/**
 * Deletes every registry entry of the given files, including query-string variants.
 * @param files - Absolute file paths.
 * @param registry - Runtime module registry.
 */
function evict(files: ReadonlySet<string>, registry: RuntimeModuleRegistry): void {
  for (const key of registry.keys())
    if (files.has(key.split("?", 1)[0] ?? key)) registry.evict(key);
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

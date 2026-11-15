/**
 * Clears what a candidate import that failed to parse left in the runtime's module registry. After
 * a parse error Bun keeps the module that did not parse, and every project module the failed
 * import reached on the way to it, in its loader without listing them in the registry keys, and a
 * later import of any of them never settles: `relkit check` on Bun then waited for the evaluator's
 * 10 s timeout as soon as a second candidate imported the broken file. The one-shot evaluator child
 * calls this after each failed candidate; it walks the candidate's project imports (outside
 * `node_modules` and `.relkit`), and drops by path every reached file the registry does not list
 * as loaded, so the next import parses it again and fails with the same located errors. Runtimes
 * without an evictable registry (Node) settle such imports on their own. The warm evaluator of
 * `relkit dev` does the same through its module reloader.
 */
import { readFileSync } from "node:fs";
import { dirname, extname, resolve, sep } from "node:path";
import type { RuntimeSourceLoader } from "relkit/runtime";
import { runtime } from "../../runtime/index.js";
import { importBuildErrors } from "./evaluator-build-errors.js";

/** Loaders for the source extensions whose imports are followed. */
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
 * Drops the modules a candidate import that did not parse left unusable.
 * @param error - Native import rejection of the candidate.
 * @param candidate - Absolute candidate file.
 * @param projectRoot - Absolute project root.
 * @returns The absolute files dropped, sorted; none when the rejection is not a parse error.
 */
export function discardUnparsedModules(
  error: unknown,
  candidate: string,
  projectRoot: string,
): readonly string[] {
  const registry = runtime.modules.registry;
  if (registry === undefined) return [];
  const { files } = importBuildErrors(error, projectRoot);
  if (files.length === 0) return [];
  const root = resolve(projectRoot);
  const loaded = new Set(registry.keys().map((key) => key.split("?", 1)[0] ?? key));
  const dropped = new Set(files);
  const pending = [candidate];
  const seen = new Set<string>();
  while (pending.length > 0) {
    const file = pending.pop()!;
    if (seen.has(file) || loaded.has(file) || !isApplicationFile(root, file)) continue;
    seen.add(file);
    dropped.add(file);
    pending.push(...importsOf(file, registry.scanImports));
  }
  for (const key of registry.keys())
    if (dropped.has(key.split("?", 1)[0] ?? key)) registry.evict(key);
  for (const file of dropped) registry.evict(file);
  return [...dropped].sort();
}

/**
 * Resolves the imports of one module.
 * @param file - Absolute module path.
 * @param scan - The registry's import scanner.
 * @returns Absolute resolved dependencies; a file that does not parse, or a specifier that does
 * not resolve, contributes none.
 */
function importsOf(
  file: string,
  scan: (source: string, loader: RuntimeSourceLoader) => readonly string[],
): string[] {
  const loader = LOADERS[extname(file)];
  if (loader === undefined) return [];
  try {
    return scan(readFileSync(file, "utf8"), loader).flatMap((specifier) => {
      try {
        return [runtime.modules.resolve(specifier, dirname(file))];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

/**
 * Tells whether a file is application source below the root.
 * @param root - Absolute project root.
 * @param file - Absolute path without a query string.
 * @returns Whether it is below the root and outside `node_modules` and `.relkit`.
 */
function isApplicationFile(root: string, file: string): boolean {
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
  if (!file.startsWith(prefix)) return false;
  const local = file.slice(prefix.length);
  return !local.includes(`node_modules${sep}`) && !local.startsWith(`.relkit${sep}`);
}

/**
 * Module resolution on Node. `require.resolve` from the importing directory covers relative
 * paths and packages with a `require` or `default` export; packages that export only an
 * `import` condition are resolved from their `exports` map with the conditions an ES module
 * import uses. Node's ES module cache cannot drop an evaluated module, so there is no registry:
 * development reloads restart the process instead.
 */
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve as resolvePath } from "node:path";
import type { RuntimeModules } from "../runtime-processes.types.js";

const CONDITIONS = ["node", "import", "default"] as const;

/**
 * Resolves a specifier from a directory.
 * @param specifier - Package, relative or absolute specifier.
 * @param fromDirectory - Directory of the importing module.
 * @returns Absolute file path.
 */
function resolve(specifier: string, fromDirectory: string): string {
  try {
    return createRequire(join(fromDirectory, "noop.js")).resolve(specifier);
  } catch (cause) {
    if (specifier.startsWith(".") || specifier.startsWith("/")) throw cause;
    const resolved = resolveExports(specifier, fromDirectory);
    if (resolved === undefined) throw cause;
    return resolved;
  }
}

/**
 * Resolves a package specifier through the nearest installed package's `exports` map.
 * @param specifier - Bare package specifier with an optional subpath.
 * @param fromDirectory - Directory to search `node_modules` upward from.
 * @returns Absolute target path, or undefined when no condition matches.
 */
function resolveExports(specifier: string, fromDirectory: string): string | undefined {
  const parts = specifier.split("/");
  const nameLength = specifier.startsWith("@") ? 2 : 1;
  const name = parts.slice(0, nameLength).join("/");
  const subpath = ["."].concat(parts.slice(nameLength)).join("/");
  const self = selfReference(name, fromDirectory);
  if (self !== undefined) {
    const target = exportTarget(self.exports, subpath);
    return target === undefined ? undefined : realpathSync(join(self.root, target));
  }
  for (let directory = resolvePath(fromDirectory); ; directory = dirname(directory)) {
    const root = join(directory, "node_modules", name);
    let manifest: { readonly exports?: unknown };
    try {
      manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    } catch {
      if (dirname(directory) === directory) return undefined;
      continue;
    }
    const target = exportTarget(manifest.exports, subpath);
    return target === undefined ? undefined : realpathSync(join(root, target));
  }
}

/**
 * Finds the package a directory belongs to when it is the one named, as a package may import
 * its own subpaths by name.
 * @param name - Package name.
 * @param fromDirectory - Importing directory.
 * @returns The package root and `exports`, or undefined when the nearest package is another.
 */
function selfReference(
  name: string,
  fromDirectory: string,
): { readonly root: string; readonly exports: unknown } | undefined {
  for (let directory = resolvePath(fromDirectory); ; directory = dirname(directory)) {
    try {
      const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8")) as {
        readonly name?: unknown;
        readonly exports?: unknown;
      };
      return manifest.name === name ? { root: directory, exports: manifest.exports } : undefined;
    } catch {
      if (dirname(directory) === directory) return undefined;
    }
  }
}

/**
 * Selects the target of one subpath from an `exports` field.
 * @param exports - Parsed `exports` value.
 * @param subpath - `.` or `./sub/path`.
 * @returns Package-relative target, or undefined.
 */
function exportTarget(exports: unknown, subpath: string): string | undefined {
  if (typeof exports === "string" || Array.isArray(exports))
    return subpath === "." ? conditional(exports) : undefined;
  if (exports === null || typeof exports !== "object") return undefined;
  const entries = Object.entries(exports);
  if (!entries.some(([key]) => key.startsWith(".")))
    return subpath === "." ? conditional(exports) : undefined;
  const exact = entries.find(([key]) => key === subpath);
  if (exact !== undefined) return conditional(exact[1]);
  for (const [key, value] of entries) {
    const star = key.indexOf("*");
    if (star < 0) continue;
    const prefix = key.slice(0, star);
    const suffix = key.slice(star + 1);
    if (!subpath.startsWith(prefix) || !subpath.endsWith(suffix)) continue;
    const match = subpath.slice(prefix.length, subpath.length - suffix.length);
    return conditional(value)?.replaceAll("*", match);
  }
  return undefined;
}

/**
 * Picks the first target whose condition an ES module import on Node accepts.
 * @param value - Target string, fallback array or condition object.
 * @returns Package-relative target, or undefined.
 */
function conditional(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const target = conditional(item);
      if (target !== undefined) return target;
    }
    return undefined;
  }
  if (value === null || typeof value !== "object") return undefined;
  for (const [condition, target] of Object.entries(value))
    if ((CONDITIONS as readonly string[]).includes(condition)) {
      const selected = conditional(target);
      if (selected !== undefined) return selected;
    }
  return undefined;
}

/** Module resolution on Node, without an evictable registry. */
export const nodeModules: RuntimeModules = Object.freeze({ resolve, registry: undefined });

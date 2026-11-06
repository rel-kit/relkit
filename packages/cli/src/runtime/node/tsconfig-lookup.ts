/**
 * Reads the nearest `tsconfig.json` for the Node TypeScript loader: the `paths` aliases
 * (`@app/*`) with the directory they resolve against, and the compiler options esbuild's
 * transform honours. Configurations are JSON with comments and trailing commas; a relative
 * `extends` chain is followed. Results are cached per directory for the life of the process.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** What the loader needs from one effective configuration. */
export interface LoaderConfig {
  /** Directory `paths` substitutions are relative to. */
  readonly pathsBase: string;
  readonly paths: Readonly<Record<string, readonly string[]>>;
  /** Options passed to esbuild as `tsconfigRaw.compilerOptions`. */
  readonly transformOptions: Readonly<Record<string, unknown>>;
}

const TRANSFORM_OPTIONS = [
  "jsx",
  "jsxFactory",
  "jsxFragmentFactory",
  "jsxImportSource",
  "experimentalDecorators",
  "useDefineForClassFields",
] as const;

const byDirectory = new Map<string, LoaderConfig | undefined>();

/**
 * Finds the configuration that governs a directory.
 * @param directory - Absolute directory of a source file.
 * @returns The effective configuration, or undefined when no `tsconfig.json` is above it.
 */
export function loaderConfig(directory: string): LoaderConfig | undefined {
  if (byDirectory.has(directory)) return byDirectory.get(directory);
  let found: LoaderConfig | undefined;
  const file = join(directory, "tsconfig.json");
  try {
    found = readConfig(file, 0);
  } catch {
    const parent = dirname(directory);
    found = parent === directory ? undefined : loaderConfig(parent);
  }
  byDirectory.set(directory, found);
  return found;
}

/**
 * Reads one configuration and its `extends` chain.
 * @param file - Absolute configuration path.
 * @param depth - Chain depth, bounded against cycles.
 * @returns The merged configuration; throws when the file is missing or malformed.
 */
function readConfig(file: string, depth: number): LoaderConfig {
  const parsed = JSON.parse(stripJsonComments(readFileSync(file, "utf8"))) as {
    readonly extends?: unknown;
    readonly compilerOptions?: Record<string, unknown>;
  };
  const options = parsed.compilerOptions ?? {};
  const base =
    typeof parsed.extends === "string" && parsed.extends.startsWith(".") && depth < 8
      ? readConfig(resolveExtends(dirname(file), parsed.extends), depth + 1)
      : undefined;
  const directory = dirname(file);
  const ownPaths = options["paths"];
  const baseUrl = typeof options["baseUrl"] === "string" ? options["baseUrl"] : undefined;
  const transformOptions: Record<string, unknown> = { ...base?.transformOptions };
  for (const name of TRANSFORM_OPTIONS) if (name in options) transformOptions[name] = options[name];
  if (ownPaths !== null && typeof ownPaths === "object")
    return {
      pathsBase: resolve(directory, baseUrl ?? "."),
      paths: ownPaths as Record<string, readonly string[]>,
      transformOptions,
    };
  return {
    pathsBase: baseUrl === undefined ? (base?.pathsBase ?? directory) : resolve(directory, baseUrl),
    paths: base?.paths ?? {},
    transformOptions,
  };
}

/**
 * Resolves a relative `extends` value.
 * @param directory - Directory of the extending configuration.
 * @param value - Relative path, with or without `.json`.
 * @returns Absolute configuration path.
 */
function resolveExtends(directory: string, value: string): string {
  return resolve(directory, value.endsWith(".json") ? value : `${value}.json`);
}

/**
 * Maps a bare specifier through `paths`.
 * @param specifier - Import specifier.
 * @param config - Effective configuration.
 * @returns Absolute candidate paths in declaration order; empty when no alias matches.
 */
export function pathCandidates(specifier: string, config: LoaderConfig): string[] {
  const candidates: string[] = [];
  for (const [pattern, targets] of Object.entries(config.paths)) {
    const star = pattern.indexOf("*");
    let match: string | undefined;
    if (star < 0) match = pattern === specifier ? "" : undefined;
    else {
      const prefix = pattern.slice(0, star);
      const suffix = pattern.slice(star + 1);
      if (
        specifier.length >= prefix.length + suffix.length &&
        specifier.startsWith(prefix) &&
        specifier.endsWith(suffix)
      )
        match = specifier.slice(prefix.length, specifier.length - suffix.length);
    }
    if (match === undefined) continue;
    for (const target of targets)
      candidates.push(resolve(config.pathsBase, target.replace("*", match)));
  }
  return candidates;
}

/**
 * Removes comments and trailing commas outside strings.
 * @param text - JSON with comments.
 * @returns Plain JSON text.
 */
export function stripJsonComments(text: string): string {
  let output = "";
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      const start = index;
      for (index += 1; index < text.length && text[index] !== '"'; index += 1)
        if (text[index] === "\\") index += 1;
      output += text.slice(start, index + 1);
    } else if (char === "/" && text[index + 1] === "/") {
      while (index < text.length && text[index] !== "\n") index += 1;
      output += "\n";
    } else if (char === "/" && text[index + 1] === "*") {
      index = text.indexOf("*/", index + 2);
      if (index < 0) break;
      index += 1;
    } else output += char;
  }
  return output.replace(/,(\s*[}\]])/g, "$1");
}

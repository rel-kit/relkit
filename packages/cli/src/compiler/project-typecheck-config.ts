/**
 * Chooses the configuration `relkit check` passes to the project's compiler. A project whose
 * `tsconfig.json` already lists the generated route checks, without a `rootDir` that excludes
 * them, is checked exactly as plain `tsc -p tsconfig.json` would check it. Otherwise RelKit
 * writes `tsconfig.check.json` beside the generated files: it extends the project configuration,
 * lists the same files plus the route checks, and widens only the no-emit validation root.
 */
import { writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type ts from "../typescript-parser.js";

/** Generated wrapper configuration, written only when the project's own does not suffice. */
export const CHECK_CONFIG_FILE = "tsconfig.check.json";

/**
 * Returns the configuration to check, writing the wrapper when needed.
 * @param configPath - Project `tsconfig.json`.
 * @param parsed - The project configuration as the private parser reads it.
 * @param routeChecks - Generated route checks file, when it exists.
 * @returns Absolute path of the configuration for `tsc -p`.
 */
export function checkConfigPath(
  configPath: string,
  parsed: ts.ParsedCommandLine,
  routeChecks: string | undefined,
): string {
  if (routeChecks === undefined) return configPath;
  const rootDir = parsed.options.rootDir;
  const widened = rootDir === undefined ? undefined : routeValidationRoot(rootDir, routeChecks);
  const listed = parsed.fileNames.some((file) => resolve(file) === routeChecks);
  if (listed && widened === rootDir) return configPath;
  const directory = dirname(routeChecks);
  const path = (file: string) => {
    const local = relative(directory, file).replaceAll("\\", "/");
    return local.startsWith(".") ? local : `./${local}`;
  };
  const wrapper = {
    extends: path(configPath),
    compilerOptions: widened === undefined ? {} : { rootDir: path(widened) },
    files: [...new Set([...parsed.fileNames.map((file) => resolve(file)), routeChecks])].map(path),
    include: [],
    ...(parsed.projectReferences === undefined
      ? {}
      : { references: parsed.projectReferences.map((entry) => ({ path: path(entry.path) })) }),
  };
  const output = resolve(directory, CHECK_CONFIG_FILE);
  writeFileSync(output, `${JSON.stringify(wrapper, null, 2)}\n`);
  return output;
}

/**
 * Widens only the no-emit validation root to include generated TypeScript assertions.
 * @param rootDir - Authored validation root.
 * @param routeChecks - Generated route assertion file requiring the same validation.
 * @returns A shared ancestor root without changing emitted production source paths.
 */
export function routeValidationRoot(rootDir: string, routeChecks: string): string {
  for (;;) {
    const path = relative(rootDir, routeChecks);
    if (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path)) return rootDir;
    const parent = dirname(rootDir);
    if (parent === rootDir) return rootDir;
    rootDir = parent;
  }
}

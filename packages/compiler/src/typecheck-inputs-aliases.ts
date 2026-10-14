/** Registers whole installed package aliases so native declaration re-exports remain resolvable. */
import { existsSync, lstatSync, readdirSync, realpathSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

/**
 * Registers a realpathed package or declaration and its native dependency container.
 * @param aliases - Check-owned mapping to lexical installed paths.
 * @param physical - Native resolved package or file path.
 * @param lexical - Equivalent lexical installed path.
 * @returns Completion after whole-package and transitive container aliases are retained.
 */
export function registerDependencyAlias(
  aliases: Map<string, string>,
  physical: string,
  lexical: string,
): void {
  const packageMatch = [...lexical.matchAll(/\/node_modules\/(?:@[^/]+\/)?[^/]+/g)].at(-1);
  if (packageMatch?.index !== undefined) {
    const packageRoot = lexical.slice(0, packageMatch.index + packageMatch[0].length);
    const packagePhysical = existsSync(packageRoot)
      ? realpathSync(packageRoot)
      : resolve(physical, relative(lexical, packageRoot));
    register(aliases, packagePhysical, packageRoot);
    registerContainer(aliases, packagePhysical, packageRoot);
  }
  register(aliases, physical, lexical);
}

/**
 * Retains the shortest direct lexical package identity.
 * @param aliases - Check-owned installed mappings.
 * @param physical - Native path.
 * @param lexical - Portable installed location.
 * @returns Completion after the best known alias is retained.
 */
function register(aliases: Map<string, string>, physical: string, lexical: string): void {
  const previous = aliases.get(physical);
  if (previous === undefined || lexical.length < previous.length) aliases.set(physical, lexical);
}

/**
 * Allows transitive resolution through a package's private or sibling native installation.
 * @param aliases - Check-owned installed mappings.
 * @param physical - Canonical package root.
 * @param lexical - Corresponding installed root.
 * @returns Completion without walking transitive dependency trees.
 */
function registerContainer(aliases: Map<string, string>, physical: string, lexical: string): void {
  const nested = join(lexical, "node_modules");
  // Bun's isolated package container can resolve declaration peers from the same
  // installation's hoisted node_modules. This is installed dependency authority,
  // while unrelated project ancestors remain outside the journal's host policy.
  const physicalModules = physical.match(/^.*?\/node_modules(?=\/)/)?.[0];
  const lexicalModules = lexical.match(/^.*?\/node_modules(?=\/)/)?.[0];
  if (physicalModules && lexicalModules) register(aliases, physicalModules, lexicalModules);
  try {
    register(aliases, realpathSync(join(physical, "node_modules")), nested);
  } catch {
    /* A package can resolve through its sibling container instead. */
  }
  const parent = dirname(physical);
  const container = basename(parent).startsWith("@") ? dirname(parent) : parent;
  if (basename(container) === "node_modules") register(aliases, container, nested);
}

/**
 * Inventories directly installed packages before the first native type-resolution callback.
 * @param root - Acquired project root.
 * @returns Initial physical aliases without recursively traversing dependencies.
 */
export function installedDependencyAliases(root: string): Map<string, string> {
  const aliases = new Map<string, string>();
  const modules = join(root, "node_modules");
  aliases.set(modules, modules);
  let entries: string[];
  try {
    entries = readdirSync(modules);
  } catch {
    return aliases;
  }
  for (const entry of entries) {
    const path = join(modules, entry);
    try {
      if (entry.startsWith("@") && !lstatSync(path).isSymbolicLink()) {
        for (const name of readdirSync(path)) {
          const lexical = join(path, name);
          registerDependencyAlias(aliases, realpathSync(lexical), lexical);
        }
      } else registerDependencyAlias(aliases, realpathSync(path), path);
    } catch {
      /* Broken optional peer links are absent candidates. */
    }
  }
  return aliases;
}

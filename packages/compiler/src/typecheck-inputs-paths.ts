/** Pure portable identity for a check's lexical root, physical root and installed package aliases. */
import { isAbsolute, relative, resolve } from "node:path";
import type { TypecheckInputState } from "./typecheck-inputs.types.js";

/**
 * Identifies ancestor containers whose existence is already proved by the acquired root.
 * @param state - Acquired lexical and physical project root.
 * @param path - Native directory probe.
 * @returns Whether this is a root ancestor, granting no file or child-directory authority.
 */
export function typecheckAncestorDirectory(state: TypecheckInputState, path: string): boolean {
  const directory = isAbsolute(path) ? resolve(path) : resolve(state.root, path);
  return [state.root, state.physicalRoot].some((root) => {
    const child = relative(directory, root);
    return child !== ".." && !child.startsWith("../") && !isAbsolute(child);
  });
}

/**
 * Normalizes a host path without persisting the native project or package location.
 * @param state - Check-owned root and dependency aliases.
 * @param path - Native host query or project-relative path.
 * @returns Portable contained identity, including dot for the root, or undefined for an ancestor.
 */
export function typecheckInputPath(state: TypecheckInputState, path: string): string | undefined {
  const absolute = isAbsolute(path) ? path : resolve(state.root, path);
  const contained = containedPath(state, absolute);
  if (contained !== undefined) return contained;
  const aliases = [...state.dependencyAliases].sort(
    ([left], [right]) => right.length - left.length,
  );
  for (const [physical, lexical] of aliases) {
    const child = relative(physical, absolute);
    if (child !== ".." && !child.startsWith("../") && !isAbsolute(child))
      return relative(state.root, resolve(lexical, child)) || ".";
  }
  return undefined;
}

/**
 * Restricts authored reads to either real representation of the acquired project root.
 * @param state - Lexical and canonical root authority.
 * @param absolute - Native absolute file or directory.
 * @returns Contained relative identity or undefined for an escape.
 */
export function containedPath(state: TypecheckInputState, absolute: string): string | undefined {
  for (const root of [state.root, state.physicalRoot]) {
    const local = relative(root, absolute);
    if (local !== ".." && !local.startsWith("../") && !isAbsolute(local)) return local || ".";
  }
  return undefined;
}

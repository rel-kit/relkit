/**
 * Keeps module resolution results across the checks of a long-lived development checker.
 * A literal's resolution depends on which files exist, the effective compiler options and
 * the installed packages, never on the text of the authored sources; so results stay valid
 * while the project root, the options and the set of authored file names are unchanged, and
 * the whole memo is replaced when any of them changes. A one-shot check keeps nothing.
 */
import type ts from "../typescript-parser.js";
import { parsedSourcesRetained } from "./discovery/parsed-sources.js";
import type { SourceDependency, SourceResolutionInput } from "./source-resolution.types.js";

let shared: { readonly key: string; readonly entries: Map<string, SourceDependency> } | undefined;

/**
 * Returns the resolution memo for one check's inputs.
 * @param input - Project root and authored sources of the check.
 * @param options - Effective compiler options used to resolve.
 * @returns The memo shared with earlier checks of the same inputs, or undefined when the
 * process does not retain compiler state between checks.
 */
export function resolutionMemo(
  input: SourceResolutionInput,
  options: ts.CompilerOptions,
): Map<string, SourceDependency> | undefined {
  if (!parsedSourcesRetained()) return undefined;
  const key = [input.root, JSON.stringify(options), ...[...input.sources.keys()].sort()].join("\0");
  if (shared?.key !== key) shared = { key, entries: new Map() };
  return shared.entries;
}

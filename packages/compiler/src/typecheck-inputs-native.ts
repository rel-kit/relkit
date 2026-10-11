/**
 * Records synchronous TypeScript host callbacks inside one check's journal.
 * Ancestor files are unavailable to this isolated host. Successful source reads
 * retain the original TypeScript parser, while both present and absent resolution
 * probes are recorded so a later shadow declaration cannot bypass validation.
 */
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import ts from "typescript";
import type { TypecheckInputState, TypecheckInputWitness } from "./typecheck-inputs.types.js";

/**
 * Normalizes both lexical and physical aliases of a project into portable paths.
 * @param state - Acquired project containment witnesses.
 * @param path - Native absolute or project-relative host query.
 * @returns Relative identity, dot for the root, or absence for ancestor resolution.
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

/** Resolves only paths physically or lexically contained by the project itself. */
function containedPath(state: TypecheckInputState, absolute: string): string | undefined {
  for (const root of [state.root, state.physicalRoot]) {
    const local = relative(root, absolute);
    if (local !== ".." && !local.startsWith("../") && !isAbsolute(local)) return local || ".";
  }
  return undefined;
}

/**
 * Retains a bounded observation and detects inconsistent repeated host queries.
 * @param state - Check-local callback state.
 * @param witness - Actual native observation with its portable identity.
 * @returns Completion; eligibility failures are surfaced by the observed evidence operation.
 */
function record(state: TypecheckInputState, witness: TypecheckInputWitness): void {
  if (state.witnesses.size >= 50_000) {
    state.failure = "oversized";
    return;
  }
  const key = `${witness.kind}:${witness.path}`;
  const previous = state.witnesses.get(key);
  if (
    previous !== undefined &&
    JSON.stringify(previous) !== JSON.stringify(witness) &&
    !witness.path.startsWith("node_modules/")
  )
    state.failure = "changed";
  state.witnesses.set(key, witness);
}

/**
 * Records exact text consumed by TypeScript, excluding escaped physical links.
 * @param state - Per-check native journal.
 * @param path - Host source path, normalized before persistence.
 * @param text - Text actually returned by the original TypeScript host.
 * @returns Completion or a later evidence rejection, without storing source text.
 */
function recordRead(state: TypecheckInputState, path: string, text: string): void {
  const local = typecheckInputPath(state, path);
  if (local === undefined) {
    state.failure = "escaped";
    return;
  }
  // Installed dependency bytes are captured by the separate complete dependency
  // inventory. Keeping them in this authored-input journal would duplicate that
  // authority and make linked package aliases collide under portable identities.
  if (local.startsWith("node_modules/")) return;
  if (containedPath(state, realpathSync(path)) === undefined) {
    state.failure = "escaped";
    return;
  }
  record(state, {
    kind: "read",
    path: local,
    hash: `sha256:${createHash("sha256").update(text).digest("hex")}`,
  });
}

/**
 * Wraps config and resolution callbacks without changing their successful native results.
 * @param state - One acquired check's mutable observations.
 * @returns Isolated TypeScript system; no callbacks are registered outside the check.
 */
export function typecheckInputSystem(state: TypecheckInputState): ts.System {
  return {
    ...ts.sys,
    getExecutingFilePath: () => join(state.root, "node_modules/typescript/lib/typescript.js"),
    readFile(path, encoding) {
      if (typecheckInputPath(state, path) === undefined) return undefined;
      const text = ts.sys.readFile(path, encoding);
      if (text !== undefined) recordRead(state, path, text);
      return text;
    },
    fileExists: (path) => exists(state, path, "fileExists"),
    directoryExists: (path) => exists(state, path, "directoryExists"),
    realpath(path) {
      const local = typecheckInputPath(state, path);
      const physical = resolve(ts.sys.realpath?.(path) ?? path);
      if (local?.startsWith("node_modules/") && containedPath(state, physical) === undefined)
        registerDependencyAlias(state, physical, resolve(state.root, local));
      return physical;
    },
    getDirectories(path) {
      const local = typecheckInputPath(state, path);
      if (local === undefined) return [];
      const entries = ts.sys.getDirectories(path).sort();
      record(state, { kind: "directories", path: local, entries });
      return entries;
    },
  };
}

/** Registers one resolved package and the sibling container used for transitive imports. */
function registerDependencyAlias(
  state: TypecheckInputState,
  physical: string,
  lexical: string,
): void {
  const previous = state.dependencyAliases.get(physical);
  if (previous === undefined || lexical.length < previous.length)
    state.dependencyAliases.set(physical, lexical);
  const parent = dirname(physical);
  const container = basename(parent).startsWith("@") ? dirname(parent) : parent;
  if (basename(container) !== "node_modules") return;
  const nested = join(lexical, "node_modules");
  const current = state.dependencyAliases.get(container);
  if (current === undefined || nested.length < current.length)
    state.dependencyAliases.set(container, nested);
}

/**
 * Records positive and negative resolution queries using the native TypeScript semantics.
 * @param state - One check's journal.
 * @param path - Native host query.
 * @param kind - File versus directory existence operation.
 * @returns Original existence result inside the root, false for isolated ancestors.
 */
function exists(
  state: TypecheckInputState,
  path: string,
  kind: "fileExists" | "directoryExists",
): boolean {
  const local = typecheckInputPath(state, path);
  if (local === undefined) return false;
  const present = kind === "fileExists" ? ts.sys.fileExists(path) : ts.sys.directoryExists(path);
  record(state, { kind, path: local, exists: present });
  return present;
}

/**
 * Preserves TypeScript source parsing while observing its otherwise closed-over readFile.
 * @param state - Current check's journal.
 * @param system - Wrapped config/resolution authority.
 * @param options - Actual parsed compiler settings.
 * @returns A host recording every consumed source and both missing/present resolution probes.
 */
export function typecheckInputHost(
  state: TypecheckInputState,
  system: ts.System,
  options: ts.CompilerOptions,
): ts.CompilerHost {
  const native = ts.createCompilerHost(options);
  const library = join(state.root, "node_modules/typescript/lib");
  return {
    ...native,
    getCurrentDirectory: () => state.root,
    getDefaultLibLocation: () => library,
    getDefaultLibFileName: () => join(library, ts.getDefaultLibFileName(options)),
    readFile: system.readFile,
    fileExists: system.fileExists,
    directoryExists: system.directoryExists,
    getDirectories: system.getDirectories,
    realpath: (path) => system.realpath?.(path) ?? path,
    getSourceFile(path, languageVersion, onError, shouldCreateNewSourceFile) {
      if (typecheckInputPath(state, path) === undefined) return undefined;
      const source = native.getSourceFile(
        path,
        languageVersion,
        onError,
        shouldCreateNewSourceFile,
      );
      if (source !== undefined) recordRead(state, path, source.text);
      return source;
    },
  };
}

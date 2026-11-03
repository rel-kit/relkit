/**
 * Records synchronous TypeScript host callbacks inside one check's journal.
 * Ancestor files are unavailable to this isolated host. Successful source reads
 * retain the original TypeScript parser, while both present and absent resolution
 * probes are recorded so a later shadow declaration cannot bypass validation.
 */
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import ts from "typescript";
import { registerDependencyAlias } from "./typecheck-inputs-aliases.js";
import type { TypecheckInputState, TypecheckInputWitness } from "./typecheck-inputs.types.js";
import {
  containedPath,
  typecheckAncestorDirectory,
  typecheckInputPath,
} from "./typecheck-inputs-paths.js";
export { typecheckInputPath } from "./typecheck-inputs-paths.js";

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
    (!witness.path.startsWith("node_modules/") || witness.kind === "read")
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
  // Runtime bundle closure does not prove declaration-only dependencies. Contained
  // consumed declarations need independent byte witnesses. External linked declarations
  // cannot be replayed by the contained file authority and must use ordinary checking.
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

    /** Reads native source text only through the check's contained authority.
     * @param path - Native filename queried by TypeScript.
     * @param encoding - Original optional TypeScript encoding hint.
     * @returns Consumed text with a byte witness, or undefined for missing/escaped input. */
    readFile(path, encoding) {
      if (typecheckInputPath(state, path) === undefined) {
        if (ts.sys.fileExists(path)) state.failure = "escaped";
        return undefined;
      }
      const text = ts.sys.readFile(path, encoding);
      if (text !== undefined) recordRead(state, path, text);
      return text;
    },
    fileExists: (path) => exists(state, path, "fileExists"),
    directoryExists: (path) => exists(state, path, "directoryExists"),

    /** Resolves native identity while retaining contained dependency alias evidence.
     * @param path - Native module/config path requested by TypeScript.
     * @returns Original physical identity; escaped declaration reads still reject reuse. */
    realpath(path) {
      const local = typecheckInputPath(state, path);
      const physical = resolve(ts.sys.realpath?.(path) ?? path);
      if (local?.startsWith("node_modules/") && containedPath(state, physical) === undefined)
        registerDependencyAlias(state.dependencyAliases, physical, resolve(state.root, local));
      return physical;
    },

    /** Journals contained directory results used by native module resolution.
     * @param path - Native directory queried by TypeScript.
     * @returns Sorted native entries inside the root, or the isolated empty ancestor result. */
    getDirectories(path) {
      const local = typecheckInputPath(state, path);
      if (local === undefined) {
        // Outside directory discovery is deliberately empty for this isolated host.
        // Its native contents are never observed or granted resolution authority.
        return [];
      }
      const entries = ts.sys.getDirectories(path).sort();
      record(state, { kind: "directories", path: local, entries });
      return entries;
    },
  };
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
  if (local === undefined) {
    if (kind === "directoryExists" && typecheckAncestorDirectory(state, path)) return true;
    // TypeScript routinely searches ancestor node_modules for optional peers.
    // Suppressing that directory is stable host policy, not an external input.
    // A requested external file/config still rejects reusable evidence.
    if (kind === "fileExists" && ts.sys.fileExists(path)) state.failure = "escaped";
    return false;
  }
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

    /** Preserves native parsing and records the exact source text it consumes.
     * @param path - Native source filename requested by the compiler.
     * @param languageVersion - Original syntax/parsing options.
     * @param onError - Original compiler-owned read diagnostic callback.
     * @param shouldCreateNewSourceFile - Original native source reuse choice.
     * @returns The native parsed source with its witness, or undefined for missing/escaped input. */
    getSourceFile(path, languageVersion, onError, shouldCreateNewSourceFile) {
      if (typecheckInputPath(state, path) === undefined) {
        if (ts.sys.fileExists(path)) state.failure = "escaped";
        return undefined;
      }
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

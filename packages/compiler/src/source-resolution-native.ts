/**
 * Adapts TypeScript resolution to invocation-owned virtual authored sources and
 * the real installed dependency graph. Physical project paths remain visible to
 * boundary policy, while dependencies stay external and are never evaluated.
 */
import { isAbsolute, relative, resolve } from "node:path";
import * as ts from "typescript";
import type { SourceDependency, SourceResolutionInput } from "./source-resolution.types.js";

/**
 * Extends the owning TypeScript System with exact in-memory source observations.
 * @param input - Project root and authored text consumed by this compilation.
 * @param system - Native or journal-aware TypeScript System.
 * @returns A native resolution host that supports virtual directories and .js imports.
 */
export function sourceResolutionHost(
  input: SourceResolutionInput,
  system: ts.System,
): ts.ModuleResolutionHost {
  const textByPath = new Map(
    [...input.sources].map(([file, text]) => [resolve(input.root, file), text]),
  );
  return {
    fileExists: (path) => textByPath.has(resolve(path)) || system.fileExists(path),
    readFile: (path) => textByPath.get(resolve(path)) ?? system.readFile(path),
    directoryExists: (path) =>
      [...textByPath.keys()].some((file) => file.startsWith(`${resolve(path)}/`)) ||
      system.directoryExists(path),
    getCurrentDirectory: () => input.root,
    realpath: (path) => {
      const absolute = resolve(path);
      if (textByPath.has(absolute) && !system.fileExists(absolute)) {
        // Virtual modules have no native inode, but must share the real root's
        // canonical prefix (notably /var versus /private/var on macOS).
        const physicalRoot = system.realpath?.(input.root) ?? input.root;
        return resolve(physicalRoot, relative(input.root, absolute));
      }
      return system.realpath?.(path) ?? path;
    },
  };
}

/**
 * Resolves one literal using the same effective options as application typechecking.
 * @param input - Project identity and authored source inventory.
 * @param host - Owning native/virtual resolution adapter.
 * @param options - Effective inherited TypeScript compiler options.
 * @param file - Contained project-relative importing module.
 * @param specifier - Source literal, unchanged from the AST.
 * @returns A physical source, external package, or explicit unresolved application status.
 */
export function resolveSourceDependency(
  input: SourceResolutionInput,
  host: ts.ModuleResolutionHost,
  options: ts.CompilerOptions,
  file: string,
  specifier: string,
): SourceDependency {
  const resolved = ts.resolveModuleName(
    specifier,
    resolve(input.root, file),
    options,
    host,
  ).resolvedModule;
  if (!resolved)
    return { kind: "unresolved", application: applicationSpecifier(specifier, options) };
  // TypeScript canonicalizes package links itself; authored aliases also need
  // physical ownership so a local symlink cannot bypass a service boundary.
  const physicalRoot = host.realpath?.(input.root) ?? input.root;
  const physicalFile = host.realpath?.(resolved.resolvedFileName) ?? resolved.resolvedFileName;
  const local = relative(physicalRoot, physicalFile).replaceAll("\\", "/");
  if (local.startsWith("node_modules/")) return { kind: "external" };
  if (resolved.isExternalLibraryImport && !local.startsWith("src/") && !input.sources.has(local))
    return { kind: "external" };
  if (local === ".." || local.startsWith("../") || isAbsolute(local)) {
    return { kind: "source", file: resolve(physicalFile) };
  }
  return { kind: "source", file: local };
}

/**
 * Identifies an unresolved application reference without blaming external packages.
 * @param specifier - Literal module target.
 * @param options - Effective aliases and baseUrl settings.
 * @returns Whether the unresolved target is application-relative or a declared alias.
 */
function applicationSpecifier(specifier: string, options: ts.CompilerOptions): boolean {
  if (specifier.startsWith(".") || isAbsolute(specifier)) return true;
  return Object.keys(options.paths ?? {}).some((pattern) => {
    const star = pattern.indexOf("*");
    if (star < 0) return specifier === pattern;
    return (
      specifier.startsWith(pattern.slice(0, star)) && specifier.endsWith(pattern.slice(star + 1))
    );
  });
}
